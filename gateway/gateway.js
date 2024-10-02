const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const Docker = require('dockerode')
const docker = new Docker({
    host: 'host.docker.internal',
    port: 2375
});

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

let currentIndexes = {};

const ERROR_THRESHOLD = 3;
const TIMEOUT_MULTIPLIER = 3.5;
const taskTimeoutLimit = Number(process.env.PROXY_TIMEOUT);


async function handleCircuitBreaker(serviceKey, serviceUrl) {
    const failureCountKey = `${serviceKey}:${serviceUrl}:failures`;
    const timeoutKey = `${serviceKey}:${serviceUrl}:timeout`;

    const isServiceInTimeout = await redisClient.exists(timeoutKey);
    if (isServiceInTimeout) {
        throw new Error(`${serviceKey} ${serviceUrl} is currently unavailable. It was removed by the Circuit Breaker.`);
    }

    await redisClient.incr(failureCountKey);
    const failureCount = await redisClient.get(failureCountKey);

    if (Number(failureCount) >= ERROR_THRESHOLD) {
        await redisClient.set(timeoutKey, '1');
        await redisClient.expire(timeoutKey, Math.floor(taskTimeoutLimit * TIMEOUT_MULTIPLIER / 1000));

        await redisClient.del(failureCountKey);

        const containerIp = extractContainerIp(serviceUrl);

        try {
            const containerId = await findContainerByIp(containerIp);

            if (containerId) {
                const container = docker.getContainer(containerId);

                await container.stop();
                await container.remove();

                console.log(`Docker container ${containerId} (IP: ${containerIp}) has been stopped and removed.`);
            } else {
                console.error(`No container found with IP address: ${containerIp}`);
            }
        } catch (err) {
            console.error(`Failed to stop/remove Docker container for IP ${containerIp}:`, err);
        }

        await redisClient.lRem(serviceKey, 0, serviceUrl);

        throw new Error(`${serviceKey} ${serviceUrl} has been removed temporarily due to repeated failures.`);
    }
}

function extractContainerIp(serviceUrl) {
    const urlParts = serviceUrl.split('//')[1];
    const containerIp = urlParts.split(':')[0];
    return containerIp;
}

async function findContainerByIp(containerIp) {
    try {
        const containers = await docker.listContainers({ all: true });

        for (const container of containers) {
            const containerDetails = await docker.getContainer(container.Id).inspect();
            const networks = containerDetails.NetworkSettings.Networks;

            for (const networkName in networks) {
                if (networks[networkName].IPAddress === containerIp) {
                    return container.Id;
                }
            }
        }
    } catch (err) {
        console.error('Error finding container by IP:', err);
        return null;
    }

    return null;
}

async function resetFailureCount(serviceKey, serviceUrl) {
    const failureCountKey = `${serviceKey}:${serviceUrl}:failures`;
    await redisClient.del(failureCountKey);
}

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

        await handleCircuitBreaker(serviceKey, targetUrl);

        return createProxyMiddleware({
            target: targetUrl,
            changeOrigin: true,
            selfHandleResponse: false,
            timeout: Number(process.env.PROXY_TIMEOUT),
            onProxyReq: (_proxyReq, req) => {
                console.log(`Proxying request to: ${targetUrl}${req.url}`);
            },
            onError: async (err, _req, _res) => {
                console.error('Proxy error:', err);
                await handleCircuitBreaker(serviceKey, targetUrl);
            },
            onProxyRes: async (proxyRes, _req, _res) => {
                if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 500) {
                    await resetFailureCount(serviceKey, targetUrl);
                }
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
