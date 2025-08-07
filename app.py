import os
import io
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid
from backgroundremover.bg import remove
from openai import OpenAI
import base64, mimetypes
from io import BytesIO
import traceback
from PIL import Image
from io import BytesIO
import base64

# app = Flask(__name__)
app = Flask(__name__, static_folder='client/dist', static_url_path='')
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://localhost:5174","http://localhost:5175"]}})

client = OpenAI()


def static_to_base64(file_path: str) -> str:
    """
    file_path: e.g. 'static/assets/a2e82503-5350-4eb4.png'
    returns:  'data:image/png;base64,AAA...'
    """

    mime, _ = mimetypes.guess_type(file_path) or ('application/octet-stream', None)

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')

    return f'data:{mime};base64,{b64}'
def base64_to_static(base64_url, output_dir="static/assets"):
    # Ensure the directory exists
    os.makedirs(output_dir, exist_ok=True)

    # Split the header and the base64 data
    if ',' not in base64_url:
        raise ValueError("Invalid base64 image URL")

    header, encoded = base64_url.split(",", 1)

    # Determine the image extension from the header
    if "image/png" in header:
        ext = "png"
    elif "image/jpeg" in header:
        ext = "jpg"
    else:
        raise ValueError("Unsupported image format")

    # Generate unique filename
    unique_name = f"{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(output_dir, unique_name)

    # Decode and save
    with open(file_path, "wb") as f:
        f.write(base64.b64decode(encoded))

    return file_path  # e.g., 'static/assets/abc123.png'

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
    # remove_bg('static/assets/cherry.jpg', 'static/assets/cherryout.jpg')
    json_data = request.get_json()
    if not json_data or 'src' not in json_data:
        return jsonify({"error": "JSON must include 'src' and 'dst'"}), 400
    src_path = json_data['src']
    if 'static' not in src_path:
        src_path = base64_to_static(src_path)
    unique_name = str(uuid.uuid4())  # e.g. 'a8098c1a-f86e-11da-bd1a-00112444be1e'
    dst_path = f"static/assets/{unique_name}.png"

    try:
        remove_bg(src_path, dst_path)
        return jsonify({"status": "success", "output": static_to_base64(dst_path)})
    except Exception as e:
        print(f"Error during remove_bg: {e}")  # Optional: for debugging
        return jsonify({"error": str(e)}), 500


@app.route('/sample-properties', methods=['POST'])
def sample_properties():
    json_data = request.get_json()
    prompt = json_data.get('prompt', '')

    try:

        response = client.responses.create(
            model="gpt-4.1-nano",
            input=prompt
        )
        # Process result
        print(response.output_text)

        return jsonify({

            "output": response.output_text,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/text-to-image', methods=['POST'])
def text_to_image():
    json_data = request.get_json()
    if not json_data or 'prompt' not in json_data:
        return jsonify({"error": "JSON must include 'image_base64' and 'output_path'"}), 400

    prompt = json_data.get('prompt', '')
    # output_path = json_data['output_path']

    try:
        result = client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            quality="high",
            size="1024x1024",
        )

        # Process result
        result_base64 = result.data[0].b64_json
        result_base64 = f"data:image/png;base64,{result_base64}"
        # output_bytes = base64.b64decode(result_base64)
        #
        # # Resize and save
        # image = Image.open(io.BytesIO(output_bytes))
        # resized_image = image.resize((512, 512), Image.LANCZOS)
        # resized_image.save(output_path)
        #
        # # Convert to base64 for response
        # buffered = io.BytesIO()
        # resized_image.save(buffered, format="PNG")
        # output_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        # output_base64 = f"data:image/png;base64,{output_base64}"
        return jsonify({
            "status": "success",
            "output": result_base64,
        })

    except Exception as e:
        traceback_str = traceback.format_exc()
        print(traceback_str)
        return jsonify({"error": str(e), "traceback": traceback_str}), 500

@app.route('/edit-image', methods=['POST'])
def edit_image():
    json_data = request.get_json()

    prompt = json_data.get('prompt', '')
    original_image = json_data.get('original_image')  #  base64
    total_mask = json_data.get('total_mask')  #  base64
    try:
        original_image_path = "static/assets/original_image.png"
        if original_image.startswith("data:image"):
            original_image = original_image.split(",", 1)[1]
        os.makedirs(os.path.dirname(original_image_path), exist_ok=True)
        with open(original_image_path, "wb") as f:
            f.write(base64.b64decode(original_image))
        if total_mask:
            total_mask_path = "static/assets/total_mask.png"
            if total_mask.startswith("data:image"):
                total_mask = total_mask.split(",", 1)[1]
            os.makedirs(os.path.dirname(total_mask_path), exist_ok=True)
            with open(total_mask_path, "wb") as f:
                 f.write(base64.b64decode(total_mask))
            print('openai edit image with mask')
            result = client.images.edit(
                model="gpt-image-1", #dall-e-2
                image=open(original_image_path, "rb"),
                mask=open(total_mask_path, "rb"),
                prompt=prompt,
                size="1024x1024",
            )
        else:
            print('openai edit whole image')
            result = client.images.edit(
                model="gpt-image-1", #dall-e-2
                image=open(original_image_path, "rb"),
                prompt=prompt,
                size="1024x1024",
            )
        result_base64 = result.data[0].b64_json
        result_base64 = f"data:image/png;base64,{result_base64}"
#         result_url = result.data[0].url

#         note: dalle2 model only has .url not the .b64_json!!!
        # Process result


        return jsonify({
            "status": "success",
            "output": result_base64,
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
    system_prompt = data.get('system_prompt')
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



# @app.route('/merge-everything', methods=['POST'])
# def merge_everything():
#     json_data = request.get_json()
#     if not json_data or 'image_base64' not in json_data or 'output_path' not in json_data:
#         return jsonify({"error": "JSON must include 'image_base64' and 'output_path'"}), 400
#
#     image_base64 = json_data['image_base64']
#     prompt = json_data.get('prompt', '')
#     output_path = json_data['output_path']
#
#     if image_base64.startswith("data:image"):
#         image_base64 = image_base64.split(",", 1)[1]
#
#     try:
#         input_path = "static/assets/input.png"
#         os.makedirs(os.path.dirname(input_path), exist_ok=True)
#
#         # Save the uploaded image to a file
#         with open(input_path, "wb") as f:
#             f.write(base64.b64decode(image_base64))
#
#         # Call OpenAI API directly with the file
#         with open(input_path, "rb") as image_file:
#             result = client.images.edit(
#                 model="gpt-image-1",
#                 image=image_file,
#                 prompt=prompt,
#                 quality="high",
#                 size="1024x1024",
#             )
#
#         # Process result
#         result_base64 = result.data[0].b64_json
#         output_bytes = base64.b64decode(result_base64)
#
#         # Resize and save
#         image = Image.open(io.BytesIO(output_bytes))
#         resized_image = image.resize((512, 512), Image.LANCZOS)
#         resized_image.save(output_path)
#
#         # Convert to base64 for response
#         buffered = io.BytesIO()
#         resized_image.save(buffered, format="PNG")
#         output_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
#         output_base64 = f"data:image/png;base64,{output_base64}"
#         return jsonify({
#             "status": "success",
#             "output": output_base64,
#         })
#
#     except Exception as e:
#         traceback_str = traceback.format_exc()
#         print(traceback_str)
#         return jsonify({"error": str(e), "traceback": traceback_str}), 500
#

@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)  # Render exposes this port by default
