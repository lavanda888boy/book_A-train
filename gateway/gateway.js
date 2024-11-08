const express = require('express');
const redis = require('redis');
const rateLimit = require('express-rate-limit');

const axios = require('axios');
const winston = require('winston');

const app = express();
require('dotenv').config();

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
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
const MAX_CIRCUIT_BREAKER_RETRIES = Number(process.env.MAX_CIRCUIT_BREAKER_RETRIES);
const MAX_CIRCUIT_BREAKER_SERVICE_CHECKS = Number(process.env.MAX_CIRCUIT_BREAKER_SERVICE_CHECKS);


async function handleCircuitBreaker(serviceKey, serviceUrl, req, serviceChecks = 0) {
    for (let attempt = 1; attempt <= MAX_CIRCUIT_BREAKER_RETRIES; attempt++) {
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
    
    serviceChecks++;
    await redisClient.lRem(serviceKey, 0, serviceUrl.replace(/^http:\/\//, ''));

    logger.error(JSON.stringify({
        "service": "gateway",
        "module": "circuit_breaker",
        "msg": `${serviceKey} ${serviceUrl} is no longer available due to consecutive errors`,
    }));

    if (serviceChecks >= MAX_CIRCUIT_BREAKER_SERVICE_CHECKS) {
        return { status: 503, data: { detail: `${serviceKey} is not available` } };
    }

    try {
        const nextServiceUrl = (LOAD_BALANCER_TYPE === 0) 
            ? await getRoundRobinService(serviceKey)
            : await getLeastConnectionsService(serviceKey);

        return await handleCircuitBreaker(serviceKey, nextServiceUrl, req, serviceChecks);
    } catch (error) {
        return { status: 503, data: { detail: `${serviceKey} is not available` } };
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

async function orchestrateTrainAndLobbyCreationSaga(req, trainBookingServiceKey = 'train_booking_service', lobbyServiceKey = 'lobby_service') {
    try {
        const trainBookingServiceReq = {
            method: 'POST',
            path: '/trains',
            rawBody: req.rawBody,
            headers: req.headers
        };

        const trainBookingServiceUrl = (LOAD_BALANCER_TYPE === 0) 
            ? await getRoundRobinService(trainBookingServiceKey)
            : await getLeastConnectionsService(trainBookingServiceKey);

        const trainBookingServiceResponse = await handleCircuitBreaker(trainBookingServiceKey, `${trainBookingServiceUrl}`, trainBookingServiceReq);

        if (trainBookingServiceResponse.status !== 200) {
            throw new Error('Train registration failed');
        }

        const lobbyServiceReq = {
            method: 'POST',
            path: '/lobbies',
            rawBody: JSON.stringify({ train_id: trainBookingServiceResponse.data }),
            headers: {
                'Content-Type': 'application/json', 
            }
        };

        const lobbyServiceUrl = (LOAD_BALANCER_TYPE === 0) 
            ? await getRoundRobinService(lobbyServiceKey)
            : await getLeastConnectionsService(lobbyServiceKey);
            
        const lobbyServiceResponse = await handleCircuitBreaker(lobbyServiceKey, lobbyServiceUrl, lobbyServiceReq);

        if (lobbyServiceResponse.status !== 200) {
            const trainBookingServiceRollbackReq = {
                method: 'DELETE',
                path: `/trains/${trainBookingServiceResponse.data}`,
                headers: req.headers
            };

            await handleCircuitBreaker(trainBookingServiceKey, trainBookingServiceUrl, trainBookingServiceRollbackReq);
            
            throw new Error('Lobby creation failed and train registration was rolled back');
        }

        return {
            status: 200,
            data: {
                trainRegistration: trainBookingServiceResponse.data,
                lobbyCreation: lobbyServiceResponse.data,
            }
        };
    } catch (error) {
        return {
            status: 500,
            data: { detail: 'Train registration saga failed: ' + error.message },
        };
    }
}

function logRequest(req, module=null) {
    const logObject ={
        service: 'gateway',
        event: 'request',
        method: req.method,
        url: req.url,
        ip: req.ip,
    };

    if (module !== null) {
        logObject.module = module;
    }

    logger.info(JSON.stringify(logObject));
}

function logResponse(req, res, module=null) {
    const logObject = {
        service: 'gateway',
        event: 'response',
        status_code: res.statusCode,
        method: req.method,
        url: req.url,
    };

    if (module !== null) {
        logObject.module = module;
    }

    logger.info(JSON.stringify(logObject));
}

let requestCounts = {
    train_booking_service: 0,
    lobby_service: 0,
};

function monitorLoad() {
    Object.keys(requestCounts).forEach(serviceKey => {
        if (requestCounts[serviceKey] >= CRITICAL_LOAD) {
            logger.warn(JSON.stringify({
                "service": "gateway",
                "module": "load_monitor",
                "msg": `WARNING: Critical load reached for ${serviceKey}: ${requestCounts[serviceKey]} requests per ${MONITORING_INTERVAL / 1000} seconds!`,
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

app.use('/register-train-saga', limiter, async (req, res) => {
    try {
        requestCounts['train_booking_service']++;
        requestCounts['lobby_service']++;

        logRequest(req, 'saga');
        const sagaResult = await orchestrateTrainAndLobbyCreationSaga(req);
        res.status(sagaResult.status).json(sagaResult.data);
        logResponse(req, res, 'saga');
        
    } catch (error) {
        res.status(502).json({ detail: 'Register train saga failed: ' + error.message });
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
