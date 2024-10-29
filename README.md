# Train Booking System (microservice-based)
Distributed system for booking train tickets and tracking their schedule.

## Setup and Execution
Before running `docker compose` command you will need to create a `.env` file in the project root directory. The file should look like this (replace the placeholders with your actual connection credentials):

```
TRAIN_DATABASE_URL=postgresql://your_username:your_password@postgres_trains:5432/your_db
LOBBY_DATABASE_URL=postgresql://your_username:your_password@postgres_lobbies:5432/your_db

TRAIN_POSTGRES_USER=your_username
TRAIN_POSTGRES_PASSWORD=your_password
TRAIN_POSTGRES_DB=your_db

LOBBY_POSTGRES_USER=your_username
LOBBY_POSTGRES_PASSWORD=your_password
LOBBY_POSTGRES_DB=your_db

RABBITMQ_USER=your_username
RABBITMQ_PASS=your_password
```

After that run the following command in the terminal:

```
docker compose up --build
```

The containers will be created and the corresponding volumes will be generated and mounted by Docker. If you want to terminate the system execution run (you may use `-v` option to remove the volumes generated initially):

```
docker compose down
```

It is important to mention that in order for the system to behave correctly you should follow these simple rules of sending requests to certain endpoints (their documentation can be found further in this file and in the jsons from the postman folder):

1. The lobby can be created only if the train with the corresponding id exists;
2. In order to connect to a lobby via websockets that lobby should be created first;

By following these two rules you will be able to enjoy exploring the world of microservices using my application.

## Application Suitability
* **Microservice architecture** is a design approach where a software application is divided into small, independent services that communicate with each other over a network. Each service focuses on a specific functionality and can be developed, deployed, and scaled independently. 
* Regarding the suitability of this architecture for the train booking system:

    1. During peak travel times or high demand periods, you can scale the Booking Service independently by adding more instances. This ensures that the system can handle a high volume of ticket purchase requests without affecting other services.

    2. Different teams can work on the Lobby Management service to enhance real-time chat features or improve user interfaces, while another team can focus on updating or optimizing the Train Information service. These updates can be deployed independently without impacting the overall platform.

* Real world example: Amtrak, the U.S. passenger rail service, uses microservices to handle real-time train bookings, seat reservations, and cancellations. Each feature, such as train availability and user booking history, can be handled by separate services. The lobby-like functionality in Amtrak includes train selection and seat reservation, much like in the proposed system, where users interact with the lobby to select trains before finalizing bookings.

## Service Boundaries
![Architecture](./architecture.png)
* Lobby service is responsible for user communication, managing train-related user lobbies and initiating booking requests.
* Booking service handles booking requests (delegated by the lobby service), provides users with the real-time updates via the lobby service and manages train-related data, directly requested by users.

## Technology Stack and Communication Patterns
* Lobby Service: **FastAPI + websockets** + **PostgreSQL**
* Booking Service: **FastAPI** + **PostgreSQL** (replicated with failover)
* Caching: **Redis Cluster** (sharded cache)
* API Gateway + Service Discovery: **Express**
* User-service communication: **RESTful API**
* Inter-service communication: **HTTP** + **RabbitMQ**

Regarding inter-service communication: those requests which will be directed from the lobby service to the booking service will be performed via **HTTP** (ticket booking request). On the other hand, real-time notification processing (booking confirmation) will be executed via an asynchronous message queue (**RabbitMQ**). **ServiceDiscovery**, on the other hand, is going to receive **gRPC** requests from the services in order to register them.

In addition to that it is essential to clarify the use of **Data Warehouse** and **ELK Stack** components. The first one will be collecting data from the microservice databases periodically using ETL pipelines; the second one will be used for log aggregation: **LogStash** for collecting logs, **ElasticSearch** for accessing the logs and searching them efficiently and **Kibana** for visualisation purposes.

## Data Management Design
As it was mentioned earlier each of the two services will have its own database (shared among their instances). **Lobby Service** and **Booking Service** will rely on the local Postgres databases. 

However, another important detail is that service endpoints can only be accessed via gateway routes by appending them at the end of each request.
* **Gateway Endpoints**

    * `GET /status` (simple status endpoint - healthcheck)

        **Response**:
        ```
        {
            "status": "OK", 
            "message": "Gateway is running"
        }
        ```

    * `http://localhost:8080/ls` for accessing lobby service
    * `http://localhost:8080/ts` for accessing train booking service

* **Lobby Service Endpoints**:

    * `GET /status` (simple status endpoint - healthcheck)

        **Response**:
        ```
        {
            "status": "OK", 
            "message": "Lobby service is running"
        }
        ```

    * `POST /lobbies` (create lobby associated with an existing train)

        **Request**: 
        ```
        { 
            "train_id": 1 
        }
        ```

        **Response**: 
        ```
        1
        ```
    
    * `GET /lobbies` (get the list of all available lobbies)

        **Response**: 
        ```
        [
            {  
                "train_id": 1,
                "id": 1
            }
        ]
        ```
    
    * `GET /lobbies/{lobby_id}` (get information about an existing lobby)

        **Response**: 
        ```
        {  
            "train_id": 1,
            "id": 1
        }
        ```

    * `DELETE /lobbies/{lobbyId}` (delete existing lobby by its id)

        **Response**: 
        ```
        1
        ```

    * `POST /start-booking` (initiate booking process - triggers `POST /bookings` endpoint of the train booking service)
    
        **Request**: 
        ```
        {
            "train_id": 1,
            "user_credentials": "Tom Ford"
        }
        ```
        
        **Response**: 
        ```
        {
            "message": "Booking registered successfully", 
            "booking_id": response.content
        }
        ```

    * `ws://{lobby_service_address}/lobbies/ws/{lobby_id}` (connect to an existing lobby via websockets, `lobby_service_address` is actually `lobby_service_container_name:port`)

* **Train Booking Service Endpoints**:

    * `GET /status` (simple status endpoint - healthcheck)

        **Response**:
        ```
        {
            "status": "OK", 
            "message": "Train booking service is running"
        }
        ```

    * `POST /trains` (register new train)

        **Request**: 
        ```
        { 
            "route": "Chisinau-Bucuresti",
            "departure_time": "2024-09-25T06:30",
            "arrival_time": "2024-09-26T11:40",
            "available_seats": 100 
        }
        ```

        **Response**: 
        ```
        1
        ```

    * `GET /trains` (get the list of registered trains)

        **Response**:
        ```
        [
            {
                "route": "Chisinau-Bucuresti",
                "departure_time": "2024-09-25T06:30",
                "arrival_time": "2024-09-26T11:40",
                "available_seats": 100,
                "id": 1
            }
        ]
        ```

    * `GET /trains/{trainId}` (get information about a train)

        **Response**:
        ```
        {  
            "route": "Chisinau-Bucuresti",
            "departure_time": "2024-09-25T06:30",
            "arrival_time": "2024-09-26T11:40",
            "available_seats": 100,
            "id": 1
        }
        ```

    * `PUT /trains/{train_id}` (update train details by id - supports partial update)

        **Request**: 
        ```
        { 
            "route": "Chisinau-Bucuresti",
            "available_seats": 100 
        }
        ```

        **Response**: 
        ```
        1
        ```

    * `DELETE /trains/{train_id}` (delete registered train)

        **Response**: 
        ```
        1
        ```
    
    * `POST /bookings` (register new booking - triggered by the `POST /start-booking` endpoint of the lobby service)

        **Request**: 
        ```
        {
            "train_id": 1,
            "user_credentials": "Tom Ford"
        }
        ```

        **Response**: 
        ```
        1
        ```

    * `GET /bookings` (get the list of registered bookings)

        **Response**:
        ```
        [
            {
                "train_id": 1,
                "user_credentials": "Tom Ford",
                "id": 1
            }
        ]
        ```

    * `GET /bookings/{booking_id}` (get information about a booking)

        **Response**:
        ```
        {
            "train_id": 1,
            "user_credentials": "Tom Ford",
            "id": 1
        }
        ```

    * `PUT /bookings/{booking_id}` (update information about the user who made the booking)

        **Request**: 
        ```
        { 
            "user_credentials": "Jo Malone",
        }
        ```

        **Response**: 
        ```
        1
        ```

    * `DELETE /bookings/{booking_id}` (delete registered booking)

        **Response**: 
        ```
        1
        ```
    

## Deployment and Scaling
* Both of my services will be deployed as **Docker containers** in a common network (they will be managed using `docker compose` approach). The same principle will be applied for **Redis** cache and service discovery storage, and **Postgres** database, plus the gateway will be an additional **Express** container. There will be no need for lobby database containerization, as **Mongodb** is available as a cloud solution.
* Moreover, in order for the message queue communication to be possible, **RabbitMQ** will also be running in a separate container.
* In the conditions of deploying the whole solution using locally running containers **horizontal scaling** seems to be the most appropriate. It is much simplier to increase the number of service instances running than to increase the computational resources of the machine which runs the system.
