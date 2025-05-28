import os
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Generate unique filename with UUID
    unique_name = str(uuid.uuid4())  # e.g. 'a8098c1a-f86e-11da-bd1a-00112444be1e'
    filename = f"{unique_name}.png"

    UPLOAD_FOLDER = os.path.join('static','assets')
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)

    save_path = os.path.join(UPLOAD_FOLDER, filename)
    filepath = f"http://localhost:5555/static/assets/{filename}"
    print(save_path)
    file.save(save_path)

    return jsonify({"message": "File saved", "filepath": filepath})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5555)