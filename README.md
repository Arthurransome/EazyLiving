# EazyLiving

EazyLiving is a comprehensive home automation system designed to simplify and enhance your living experience. With EazyLiving, you can control and monitor various aspects of your home, including lighting, security, climate, and entertainment, all from a single, user-friendly interface.

# How to Run the Fastapi with uv

To run the FastAPI application using Uvicorn, follow these steps:

1. Clone the repository:
   ```bash
   git clone
    ```
2. Navigate to the project directory:
   ```bash
   cd your-repository-name
   ```

Setup venv and install dependencies
```bash
python -m venv venv
source venv/bin/activate  # On Windows, use `venv\Scripts\activate
pip install -r requirements.txt
```
Run the FastAPI application with Uvicorn
In the main directory, run the following command to start the FastAPI application:
```bash
uvicorn gateway.main:app --reload
```
Alternatively, if you are already in the Gateway directory, you can run:

```bash
uvicorn main:app --reload
```
alternatively, you can also use the FastAPI command to run the application from the project root directory:

```bash
fastapi dev gateway/main.py

or 
fastapi dev --app gateway.main:app

```

This command will start the FastAPI application and enable auto-reloading for development. You can access the application at `http://localhost:8000`.
