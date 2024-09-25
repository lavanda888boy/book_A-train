const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const limiter = rateLimit({
    windowMs: 1000,
    max: 5,
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
    proxyTimeout: 5000
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

app.listen(80, () => {
    console.log('Gateway server is up and running');
});
