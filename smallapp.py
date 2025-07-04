import os
import io
from PIL import Image
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid
from backgroundremover.bg import remove
from openai import OpenAI
import base64, mimetypes
from io import BytesIO
import traceback

client = OpenAI()
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

def static_to_base64(file_path: str) -> str:
    """
    file_path: e.g. 'static/assets/a2e82503-5350-4eb4.png'
    returns:  'data:image/png;base64,AAA...'
    """

    mime, _ = mimetypes.guess_type(file_path) or ('application/octet-stream', None)

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')

    return f'data:{mime};base64,{b64}'

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

    return jsonify({"message": "File saved", "filepath": filepath, "id": unique_name})

def remove_bg(src_img_path, out_img_path):
    model_choices = ["u2net", "u2net_human_seg", "u2netp"]
    with open(src_img_path, "rb") as f:
        data = f.read()
    img = remove(
        data,
        model_name=model_choices[0],
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_structure_size=10,
        alpha_matting_base_size=1000
    )
    with open(out_img_path, "wb") as f:
        f.write(img)

@app.route('/remove-bg', methods=['POST'])
def remove_bg_endpoint():
    json_data = request.get_json()
    if not json_data or 'src' not in json_data or 'dst' not in json_data:
        return jsonify({"error": "JSON must include 'src' and 'dst'"}), 400

    src_path = json_data['src']
    dst_path = json_data['dst']

    try:
        remove_bg(src_path, dst_path)
        return jsonify({"status": "success", "output": dst_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/merge-everything', methods=['POST'])
def merge_everything():
    json_data = request.get_json()
    if not json_data or 'image_base64' not in json_data or 'output_path' not in json_data:
        return jsonify({"error": "JSON must include 'image_base64' and 'output_path'"}), 400

    image_base64 = json_data['image_base64']
    prompt = json_data.get('prompt', '')
    output_path = json_data['output_path']

    if image_base64.startswith("data:image"):
        image_base64 = image_base64.split(",", 1)[1]

    try:
        input_path = "static/assets/input.png"
        os.makedirs(os.path.dirname(input_path), exist_ok=True)

        # Save the uploaded image to a file
        with open(input_path, "wb") as f:
            f.write(base64.b64decode(image_base64))

        # Call OpenAI API directly with the file
        with open(input_path, "rb") as image_file:
            result = client.images.edit(
                model="gpt-image-1",
                image=image_file,
                prompt=prompt,
                quality="high",
                size="1024x1024",
            )

        # Process result
        result_base64 = result.data[0].b64_json
        output_bytes = base64.b64decode(result_base64)

        # Resize and save
        image = Image.open(io.BytesIO(output_bytes))
        resized_image = image.resize((512, 512), Image.LANCZOS)
        resized_image.save(output_path)

        # Convert to base64 for response
        buffered = io.BytesIO()
        resized_image.save(buffered, format="PNG")
        output_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        output_base64 = f"data:image/png;base64,{output_base64}"
        return jsonify({
            "status": "success",
            "output": output_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/text-to-image', methods=['POST'])
def text_to_image():
    json_data = request.get_json()
    if not json_data or 'prompt' not in json_data or 'output_path' not in json_data:
        return jsonify({"error": "JSON must include 'image_base64' and 'output_path'"}), 400

    prompt = json_data.get('prompt', '')
    output_path = json_data['output_path']

    try:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            quality="high",
            size="1024x1024",
        )

        # Process result
        result_base64 = result.data[0].b64_json
        output_bytes = base64.b64decode(result_base64)

        # Resize and save
        image = Image.open(io.BytesIO(output_bytes))
        resized_image = image.resize((512, 512), Image.LANCZOS)
        resized_image.save(output_path)

        # Convert to base64 for response
        buffered = io.BytesIO()
        resized_image.save(buffered, format="PNG")
        output_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        output_base64 = f"data:image/png;base64,{output_base64}"
        return jsonify({
            "status": "success",
            "output": output_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/image-to-labels', methods=['POST'])
def image_to_labels():

    data = request.json
    image_path = data.get('image_path')  # either staitc/... or base64
    if (image_path.startswith("data:image")):
        full_path =  image_path
#         image_data = image_path.split(',')[1]  # remove "data:image/png;base64," part
#         with open('static/assets/lassoImage.png', 'wb') as f:
#             f.write(base64.b64decode(image_data))
#             full_path = 'static/assets/lassoImage.png'
    else:
         full_path = static_to_base64(image_path)
    prompt = data.get('prompt')
    system_prompt = '''
You are a visual description assistant.

The user will give you one visual property (like color, texture, or material) and an image.

Your task is to write a concise, vivid description of that property as clearly seen in the image.

Use natural language, not a list of keywords.
Limit your response to 8 words or fewer.
Use adjectives or phrases like “shell-like,” “light reflections,” “wood grain,” etc.
Be specific, expressive, and grounded in what’s visible.
If the property is not visible, respond only with “none”.

Return only the description. Do not explain or add anything else.

    '''
    try:
#         with open(full_path, "rb") as image_file:
        response = client.responses.create(
            model="gpt-4o-mini",

            input=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {
                        "type": "input_image",
                        "image_url": full_path,
                    },
                ],
            }],

        )

        print(response.output[0].content[0].text)
        return jsonify({
            "status": "success",
            "output": response.output[0].content[0].text,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

# remove_bg('static/assets/cherry.jpg', 'static/assets/cherryout.jpg')
# Imports the Google Cloud client library
# from google.cloud import vision
# @app.route("/api/run-vision")
# def run_quickstart():
#     client = vision.ImageAnnotatorClient()
#     file_uri = "gs://cloud-samples-data/vision/label/wakeupcat.jpg"
#
#     image = vision.Image()
#     image.source.image_uri = file_uri
#
#     response = client.label_detection(image=image)
#     labels = response.label_annotations
#
#     label_descriptions = [label.description for label in labels]
#
#     return jsonify({"labels": label_descriptions})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5555)