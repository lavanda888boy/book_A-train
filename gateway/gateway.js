const express = require('express');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const axios = require('axios');

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

const CRITICAL_LOAD = Number(process.env.CRITICAL_LOAD);
const MONITORING_INTERVAL = Number(process.env.MONITORING_INTERVAL);
const LOAD_BALANCER_TYPE = Number(process.env.LOAD_BALANCER_TYPE);


async function handleCircuitBreaker(serviceKey, serviceUrl, req) {
    let consecutiveFailures = 0;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await makeRequestToService(serviceUrl, req);
            console.log(`Attempt ${attempt} successful:`, response.data);

            consecutiveFailures = 0;
            return { status: response.status, data: response.data };
        } catch (error) {
            if (error.status === 408 || error.status >= 500) {
                consecutiveFailures++;
                console.log(`Attempt ${attempt} failed with status ${error.status}:`, error.message);
            } else {
                return { status: error.status, data: error.data };
            }
        }
    }

    if (consecutiveFailures === maxRetries) {
        await redisClient.lRem(serviceKey, 0, serviceUrl.replace(/^http:\/\//, ''));
        console.log(`${serviceKey} ${serviceUrl} is no longer available due to consecutive errors`);
        return { status: 503, data: { detail: 'Service Unavailable' } };
    }
}

async function makeRequestToService(serviceUrl, req) {
    const url = `${serviceUrl}${req.path}`;

    const options = {
        method: req.method,
        url: url,
        headers: req.headers,
        data: req.rawBody,
    };

    const response = await axios(options);
    return response;
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

async function getLeastConnectionsService(serviceKey) {
    const services = await redisClient.lRange(serviceKey, 0, -1);

    if (services.length === 0) {
        throw new Error(`${serviceKey} not available`);
    }

    let leastConnectionsService = null;
    let leastConnectionsCount = Infinity;

    for (const service of services) {
        const connectionCountKey = `${serviceKey}:${service}:connections`;
        const connectionCount = Number(await redisClient.get(connectionCountKey)) || 0;

        if (connectionCount < leastConnectionsCount) {
            leastConnectionsCount = connectionCount;
            leastConnectionsService = service;
        }
    }

    return `http://${leastConnectionsService}`;
}

async function proxyRoundRobinRequest(serviceKey) {
    try {
        const targetUrl = await getRoundRobinService(serviceKey);

        return async (req, res, _next) => {
            req.headers['X-Real-IP'] = req.ip;
            req.headers['X-Forwarded-For'] = req.headers['x-forwarded-for'] || req.ip;
            req.headers['X-Forwarded-Proto'] = req.protocol;

            const circuitBreakerResponse = await handleCircuitBreaker(serviceKey, targetUrl, req);

            if (circuitBreakerResponse.status === 503) {
                return res.status(503).json(circuitBreakerResponse.data);
            }

            proxy.web(req, res, { target: targetUrl, timeout: Number(process.env.PROXY_TIMEOUT) }, async (err) => {
                console.error('Proxy error:', err);
                res.status(502).json({ detail: 'Bad Gateway' });
            });

            return res.status(circuitBreakerResponse.status).json(circuitBreakerResponse.data);
        };
    } catch (error) {
        throw new Error(error.message);
    }
}

async function proxyRequestWithLeastConnections(serviceKey) {
    try {
        const targetUrl = await getLeastConnectionsService(serviceKey);
        const connectionCountKey = `${serviceKey}:${targetUrl.replace(/^http:\/\//, '')}:connections`;

        await redisClient.incr(connectionCountKey);

        return async (req, res, _next) => {
            req.headers['X-Real-IP'] = req.ip;
            req.headers['X-Forwarded-For'] = req.headers['x-forwarded-for'] || req.ip;
            req.headers['X-Forwarded-Proto'] = req.protocol;

            const circuitBreakerResponse = await handleCircuitBreaker(serviceKey, targetUrl, req);

            if (circuitBreakerResponse.status === 503) {
                await redisClient.decr(connectionCountKey);
                return res.status(503).json(circuitBreakerResponse.data);
            }

            proxy.web(req, res, { target: targetUrl, timeout: Number(process.env.PROXY_TIMEOUT) }, async (err) => {
                console.error('Proxy error:', err);
                res.status(502).json({ detail: 'Bad Gateway' });
                await redisClient.decr(connectionCountKey);
            });

            await redisClient.decr(connectionCountKey);
            return res.status(circuitBreakerResponse.status).json(circuitBreakerResponse.data);
        };
    } catch (error) {
        throw new Error(error.message);
    }
}

async function getProxyMiddleware(serviceKey) {
    const loadBalancerType = LOAD_BALANCER_TYPE;

    if (loadBalancerType === 0) {
        return await proxyRoundRobinRequest(serviceKey);
    } else {
        return await proxyRequestWithLeastConnections(serviceKey);
    }
}

let requestCounts = {
    train_booking_service: 0,
    lobby_service: 0,
};

function monitorLoad() {
    Object.keys(requestCounts).forEach(serviceKey => {
        if (requestCounts[serviceKey] >= CRITICAL_LOAD) {
            console.warn(`ALERT: Critical load reached for ${serviceKey}: ${requestCounts[serviceKey]} requests per ${MONITORING_INTERVAL / 1000} seconds!`);
        }

        requestCounts[serviceKey] = 0;
    });
}

intervalId = setInterval(monitorLoad, MONITORING_INTERVAL);

app.use((req, _res, next) => {
    req.rawBody = '';
    req.on('data', chunk => {
        req.rawBody += chunk;
    });
    req.on('end', () => {
        next();
    });
});

app.use('/ts', limiter, async (req, res, next) => {
    try {
        requestCounts['train_booking_service']++;

        const proxyMiddleware = await getProxyMiddleware('train_booking_service');
        proxyMiddleware(req, res, next);
    } catch (error) {
        res.status(503).json({ detail: error.message });
    }
});

app.use('/ls', limiter, async (req, res, next) => {
    try {
        requestCounts['lobby_service']++;

        const proxyMiddleware = await getProxyMiddleware('lobby_service');
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
