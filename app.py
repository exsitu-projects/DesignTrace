from flask import Flask
import os

app = Flask(__name__)

@app.route("/")
def home():
    return "Hello from Flask on Render!"

# No app.run() here — Gunicorn handles it