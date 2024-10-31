const express = require('express');
const redis = require('redis');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const winston = require('winston');

const PROTO_PATH = './service_discovery.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const ServiceDiscovery = protoDescriptor.service_discovery.ServiceDiscovery;

const app = express();
app.use(express.json());

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: './logs/service_discovery.log',
            level: 'info',
        })
    ],
});

const redisClient = redis.createClient({ 
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}` 
});
redisClient.connect();

function registerService(call, callback) {
    const serviceInfo = `${call.request.address}:${call.request.port}`;
    const serviceKey = call.request.name

    redisClient.lPush(serviceKey, serviceInfo)   
        .then(() => {
            logger.info(JSON.stringify({
                service: 'service_discovery',
                module: 'register_service',
                msg: `Service registered successfully: ${serviceKey}`,
            }));

            callback(null, { success: true, message: 'Service registered successfully' });
        })
        .catch(err => {
            logger.error(JSON.stringify({
                service: 'service_discovery',
                module: 'register_service',
                msg: `Failed to register service: ${serviceKey}. Error: ${err.message}`,
            }));

            callback(null, { success: false, message: 'Failed to register service' });
        });
}

const grpcServer = new grpc.Server();
grpcServer.addService(ServiceDiscovery.service, { Register: registerService });
grpcServer.bindAsync(`0.0.0.0:${process.env.GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
        logger.error(JSON.stringify({
            service: 'service_discovery',
            module: 'grpc_server',
            msg: `Failed to bind to port ${process.env.GRPC_PORT}`, 
        }));
        return;
    }

    logger.info(JSON.stringify({
        service: 'service_discovery',
        module: 'grpc_server',
        event: 'startup',
        port: port,
    }));
});

app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Service discovery is running' });
});

app.listen(process.env.PORT, () => {
    logger.info(JSON.stringify({
        service: 'service_discovery',
        event: 'startup',
        port: process.env.PORT,
    }));
});
