const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

require('dotenv').config()

const limiter = rateLimit({
    windowMs: Number(process.env.WINDOW_SIZE),
    max: Number(process.env.MAX_CONCURRENT_REQUESTS),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false
});

const proxyOptions = {
    changeOrigin: true,
    onProxyReq: (proxyReq, req) => {
        proxyReq.setHeader('X-Real-IP', req.ip);
        proxyReq.setHeader('X-Forwarded-For', req.headers['x-forwarded-for'] || req.ip);
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
    },
    proxyTimeout: Number(process.env.PROXY_TIMEOUT)
};

app.use('/ts', limiter, createProxyMiddleware({
    target: 'http://train_booking_service:8000',
    ...proxyOptions
}));

app.use('/ls', limiter, createProxyMiddleware({
    target: 'http://lobby_service:8000',
    ...proxyOptions
}));

app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Gateway is running' });
});

app.listen(Number(process.env.PORT), () => {
    console.log('Gateway server is up and running');
});
