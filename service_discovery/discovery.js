const express = require('express');
const redis = require('redis');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = './service_discovery.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const ServiceDiscovery = protoDescriptor.service_discovery.ServiceDiscovery;

const redisClient = redis.createClient({ 
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}` 
});

redisClient.connect();

const app = express();
app.use(express.json());

function registerService(call, callback) {
    const serviceInfo = `${call.request.address}:${call.request.port}`;
    const serviceKey = call.request.name

    redisClient.lPush(serviceKey, serviceInfo)   
        .then(() => {
            console.log(`Registered service: ${serviceKey}`);
            callback(null, { success: true, message: 'Service registered successfully' });
        })
        .catch(err => {
            console.error('Failed to register service:', err);
            callback(null, { success: false, message: 'Failed to register service' });
        });
}

const grpcServer = new grpc.Server();
grpcServer.addService(ServiceDiscovery.service, { Register: registerService });
grpcServer.bindAsync(`0.0.0.0:${process.env.GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
        console.error('Failed to bind gRPC server:', error);
        return;
    }
    console.log(`gRPC server listening on port ${port}`);
});

app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'OK', message: 'Service discovery is running' });
});

app.listen(process.env.PORT, () => {
    console.log(`Service Discovery API running on port ${process.env.PORT}`);
});
