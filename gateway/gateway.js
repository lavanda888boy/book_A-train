const express = require('express');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const app = express();
require('dotenv').config();

const httpProxy = require('http-proxy')
proxy = httpProxy.createProxyServer()

const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});
redisClient.connect();

const limiter = rateLimit({
    windowMs: Number(process.env.WINDOW_SIZE),
    max: Number(process.env.MAX_CONCURRENT_REQUESTS),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
});

let currentIndexes = {};

const ERROR_THRESHOLD = Number(process.env.ERROR_THRESHOLD);
const timeout_multiplier = 3.5;
const taskTimeoutLimit = Number(process.env.PROXY_TIMEOUT);

let requestCount = 0;
const CRITICAL_LOAD = Number(process.env.CRITICAL_LOAD);
const MONITORING_INTERVAL = Number(process.env.MONITORING_INTERVAL);
let intervalId;


async function handleCircuitBreaker(serviceKey, serviceUrl) {
    const failureCountKey = `${serviceKey}:${serviceUrl}:failures`;
    const timeoutKey = `${serviceKey}:${serviceUrl}:timeout`;

    await redisClient.incr(failureCountKey);
    const failureCount = await redisClient.get(failureCountKey);

    if (Number(failureCount) === 1) {
        await redisClient.set(timeoutKey, '1');
        await redisClient.expire(timeoutKey, Math.floor(taskTimeoutLimit * timeout_multiplier / 1000));
        return;
    }

    const isServiceInTimeout = await redisClient.exists(timeoutKey);

    if (isServiceInTimeout && (Number(failureCount) >= ERROR_THRESHOLD)) {
        await redisClient.del(failureCountKey);
        await redisClient.lRem(serviceKey, 0, serviceUrl.replace(/^http:\/\//, ''));
    }
}

async function getRoundRobinService(serviceKey) {
    const services = await redisClient.lRange(serviceKey, 0, -1);

    if (services.length === 0) {
        throw new Error(`${serviceKey} not available`);
    }

    if (!currentIndexes[serviceKey]) {
        currentIndexes[serviceKey] = 0;
    }

    const serviceUrl = `http://${services[currentIndexes[serviceKey]]}`;
    currentIndexes[serviceKey] = (currentIndexes[serviceKey] + 1) % services.length;

    return serviceUrl;
}

async function proxyRequest(serviceKey) {
    try {
        const targetUrl = await getRoundRobinService(serviceKey);

        return (req, res, _next) => {
            req.headers['X-Real-IP'] = req.ip;
            req.headers['X-Forwarded-For'] = req.headers['x-forwarded-for'] || req.ip;
            req.headers['X-Forwarded-Proto'] = req.protocol;

            proxy.web(req, res, { target: targetUrl, timeout: Number(process.env.PROXY_TIMEOUT) }, async (err) => {
                console.error('Proxy error:', err);
                res.status(502).json({ detail: 'Bad Gateway' });
            });

            proxy.on('proxyRes', async (proxyRes) => {
                if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 400) {
                    console.log(`Succesful response from ${serviceKey}`)
                } else {
                    await handleCircuitBreaker(serviceKey, targetUrl);
                }
            });
        };
    } catch (error) {
        throw new Error(error.message);
    }
}

function monitorLoad() {
    if (requestCount >= CRITICAL_LOAD) {
        console.warn(`ALERT: Critical load reached: ${requestCount} requests per ${MONITORING_INTERVAL / 1000} seconds!`);
    }
    requestCount = 0;
}

intervalId = setInterval(monitorLoad, MONITORING_INTERVAL);

app.use((_req, _res, next) => {
    requestCount++;
    next();
});

app.use('/ts', limiter, async (req, res, next) => {
    try {
        const proxyMiddleware = await proxyRequest('train_booking_service');
        proxyMiddleware(req, res, next);
    } catch (error) {
        res.status(503).json({ detail: error.message });
    }
});

app.use('/ls', limiter, async (req, res, next) => {
    try {
        const proxyMiddleware = await proxyRequest('lobby_service');
        proxyMiddleware(req, res, next);
    } catch (error) {
        res.status(503).json({ detail: error.message });
    }
});

app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Gateway is running' });
});

app.listen(Number(process.env.PORT), () => {
    console.log(`Gateway server is up and running on port ${process.env.PORT}`);
});
