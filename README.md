# Train Booking System (microservice-based)
Distributed system for booking train tickets and tracking their schedule.

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
* Lobby Service: **Python websockets** + **MongoDB** + **Redis** (Caching)
* Booking Service: **FastAPI** + **PostgreSQL** + **Redis** (Caching)
* API Gateway: **Nginx** + **Express**
* User-service communication: **RESTful API**
* Inter-service communication: **gRPC** + **RabbitMQ**

Regarding inter-service communication: those requests which will be directed from the lobby service to the booking service will be performed via **gRPC** (ticket booking request). On the other hand, real-time notification processing (booking confirmation) will be executed via an asynchronous message queue (**RabbitMQ**).

## Data Management Design
* As it was mentioned earlier each of the two services will have its own database (shared among their instances). **Lobby Service** will be using MongoDB cloud solution and **Booking Service** will rely on the local Postgres database.
* **Lobby Service Endpoints**:

    * `POST /lobbies`

        **Request**: 
        ```
        { 
            "trainId": "56789" 
        }
        ```

        **Response**: 
        ```
        { 
            "lobbyId": "abc123", 
            "message": "Lobby created successfully." 
        }
        ```

    * `DELETE /lobbies/{lobbyId}`

        **Response**: 
        ```
        { 
            "message": "Lobby abc123 deleted successfully." 
        }
        ```

    * `GET /lobbies`

        **Response**: 
        ```
        [
            { 
                "lobbyId": "abc123", 
                "trainId": "56789", 
                "status": "active" 
            }
        ]
        ```

    * `ws://lobby-service/lobby`
    
        **Client Request**: 
        ```
        { 
            "action": "join_lobby", 
            "lobbyId": "abc123", 
            "userId": "12345" 
        }
        
        **Response**: 
        ```
        { 
            "status": "success", 
            "trainId": "56789", 
            "message": "Joined lobby." 
        }
        ```

    * `gRPC /lobbies/{lobbyId}/book`
    
        **Request**: 
        ```
        { 
            "userId": "12345", 
            "seatNumber": "12A" 
        }
        ```
        
        **Response**: 
        ```
        { 
            "message": "Booking request sent via gRPC." 
        }
        ```

* **Booking Service Endpoints**:
    * `GET /bookings/trains/{trainId}`

        **Response**:
        ```
        { 
            "trainId": "56789", 
            "route": "City A - City B",
            "departureTime": 12:00:00,
            "arrivalTime": 18:00:00, 
            "availableSeats": 45 
        }
        ```

    * `GET /bookings/trains`

        **Response**:
        ```
        [{ 
            "trainId": "56789", 
            "route": "City A - City B", 
            "departureTime": 12:00:00,
            "arrivalTime": 18:00:00, 
            "availableSeats": 45 
        }]
        ```
    * `gRPC /bookings`

        **Request**:
        ```
        { 
            "trainId": "56789", 
            "userId": "12345", 
            "seatNumber": "12A" 
        }
        ```

        **Response**:
        ```
        { 
            "bookingId": "b12345", 
            "message": "Ticket booked successfully." 
        }
        ```

    * `GET /bookings`

        **Response**:
        ```
        [{ 
            "bookingId": "b12345", 
            "trainId": "56789", 
            "userId": "12345" 
        }]
        ```

## Deployment and Scaling
* Both of my services will be deployed as **Docker containers** in a common network. The same principle will be applied for **Redis** cache and **Postgres** database, plus the gateway will be an additional **Nginx** container. There will be no need for lobby database containerization, as **Mongodb** is available as a cloud solution.
* Moreover, in order for the message queue communication to be possible, **RabbitMQ** will also be running in a separate container.
* In the conditions of deploying the whole solution using locally running containers **horizontal scaling** seems to be the most appropriate. It is much simplier to increase the number of service instances running than to increase the computational resources of the machine which runs the system.