const express = require('express');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const axios = require('axios');
const winston = require('winston');

const app = express();
require('dotenv').config();

const logger = winston.createLogger({
    transports: [
        new winston.transports.Http({
            host: process.env.LOGSTASH_HOST,
            port: process.env.LOGSTASH_PORT,
            ssl: false,
            level: 'info',
        })
    ],
});

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
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await makeRequestToService(serviceUrl, req);
        
            logger.info(JSON.stringify({
                "service": "gateway",
                "module": "circuit_breaker",
                "msg": `Attempt ${attempt} to ${serviceKey} ${serviceUrl} returned status ${response.status}`,
            }));

            return { status: response.status, data: response.data };
        } catch (error) {
            if (error.status === 408 || error.status >= 500) {
                logger.error(JSON.stringify({
                    "service": "gateway",
                    "module": "circuit_breaker",
                    "msg": `Attempt ${attempt} failed with status ${error.status}: ${error.message}`,
                }));
            } else {
                return { status: error.status, data: error.data };
            }
        }
    }
    
    await redisClient.lRem(serviceKey, 0, serviceUrl.replace(/^http:\/\//, ''));

    logger.error(JSON.stringify({
        "service": "gateway",
        "module": "circuit_breaker",
        "msg": `${serviceKey} ${serviceUrl} is no longer available due to consecutive errors`,
    }));

    try {
        const nextServiceUrl = (LOAD_BALANCER_TYPE === 0) 
            ? await getRoundRobinService(serviceKey)
            : await getLeastConnectionsService(serviceKey);

        return await handleCircuitBreaker(serviceKey, nextServiceUrl, req);
    } catch (error) {
        return { status: 503, data: { detail: `${serviceKey} is no longer available` } };
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

function logRequest(req) {
    logger.info(JSON.stringify({
        service: 'gateway',
        event: 'request',
        method: req.method,
        url: req.url,
        ip: req.ip,
    }));
}

function logResponse(req, res) {
    logger.info(JSON.stringify({
        service: 'gateway',
        event: 'response',
        status_code: res.statusCode,
        method: req.method,
        url: req.url,
    }));
}

let requestCounts = {
    train_booking_service: 0,
    lobby_service: 0,
};

function monitorLoad() {
    Object.keys(requestCounts).forEach(serviceKey => {
        if (requestCounts[serviceKey] >= CRITICAL_LOAD) {
            logger.alert(JSON.stringify({
                "service": "gateway",
                "module": "load_monitor",
                "msg": `ALERT: Critical load reached for ${serviceKey}: ${requestCounts[serviceKey]} requests per ${MONITORING_INTERVAL / 1000} seconds!`,
            }));
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
       
        logRequest(req);
        proxyMiddleware(req, res, next);
        logResponse(req, res);

    } catch (error) {
        res.status(503).json({ detail: error.message });
    }
});

app.use('/ls', limiter, async (req, res, next) => {
    try {
        requestCounts['lobby_service']++;

        const proxyMiddleware = await getProxyMiddleware('lobby_service');

        logRequest(req);
        proxyMiddleware(req, res, next);
        logResponse(req, res);
    
    } catch (error) {
        res.status(503).json({ detail: error.message });
    }
});

app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Gateway is running' });
});

app.listen(Number(process.env.PORT), () => {
    logger.info(JSON.stringify({
        service: 'gateway',
        event: 'startup',
        port: process.env.PORT,
    }));
});
