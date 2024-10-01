const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const app = express();
require('dotenv').config();

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

let currentIndexes = {}

async function getRoundRobinService(serviceKey) {
    const services = await redisClient.lRange(serviceKey, 0, -1);

    if (services.length === 0) {
        throw new Error(`${serviceKey} not available`);
    }

    if (!currentIndexes[serviceKey]) {
        currentIndexes[serviceKey] = 0;
    }

    const serviceUrl = `http://${services[currentIndexes[serviceKey]].replace(/"/g, '')}`;
    currentIndexes[serviceKey] = (currentIndexes[serviceKey] + 1) % services.length;

    return serviceUrl;
}

async function proxyRequest(serviceKey) {
    try {
        const targetUrl = await getRoundRobinService(serviceKey);

        return createProxyMiddleware({
            target: targetUrl,
            changeOrigin: true,
            selfHandleResponse: false,
            timeout: Number(process.env.PROXY_TIMEOUT),
            onProxyReq: (_proxyReq, req) => {
                console.log(`Proxying request to: ${targetUrl}${req.url}`);
            },
            onError: (err, _req, res) => {
                console.error('Proxy error:', err);
                res.status(503).json({ detail: `${serviceKey} service is not available.` });
            },
        });
    } catch (error) {
        throw new Error(error.message);
    }
}

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
