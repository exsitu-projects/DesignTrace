import webcolors
import random
from collections import Counter
import numpy as np
from torchvision import transforms
import cv2  # OpenCV
import torch
import warnings
import os



def HWC3(x):
    assert x.dtype == np.uint8
    if x.ndim == 2:
        x = x[:, :, None]
    assert x.ndim == 3
    H, W, C = x.shape
    assert C == 1 or C == 3 or C == 4
    if C == 3:
        return x
    if C == 1:
        return np.concatenate([x, x, x], axis=2)
    if C == 4:
        color = x[:, :, 0:3].astype(np.float32)
        alpha = x[:, :, 3:4].astype(np.float32) / 255.0
        y = color * alpha + 255.0 * (1.0 - alpha)
        y = y.clip(0, 255).astype(np.uint8)
        return y
    
def common_input_validate(input_image, output_type, **kwargs):
    if "img" in kwargs:
            warnings.warn("img is deprecated, please use `input_image=...` instead.", DeprecationWarning)
            input_image = kwargs.pop("img")
    
    if "return_pil" in kwargs:
            warnings.warn("return_pil is deprecated. Use output_type instead.", DeprecationWarning)
            output_type = "pil" if kwargs["return_pil"] else "np"
    
    if type(output_type) is bool:
        warnings.warn("Passing `True` or `False` to `output_type` is deprecated and will raise an error in future versions")
        if output_type:
            output_type = "pil"

    if input_image is None:
        raise ValueError("input_image must be defined.")

    if not isinstance(input_image, np.ndarray):
        input_image = np.array(input_image, dtype=np.uint8)
        output_type = output_type or "pil"
    else:
        output_type = output_type or "np"
    
    return (input_image, output_type)

def cv2_resize_shortest_edge(image, size):
    h, w = image.shape[:2]
    if h < w:
        new_h = size
        new_w = int(round(w / h * size))
    else:
        new_w = size
        new_h = int(round(h / w * size))
    resized_image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized_image

def apply_color(img, res=512):
    img = cv2_resize_shortest_edge(img, res)
    h, w = img.shape[:2]

    input_img_color = cv2.resize(img, (w//64, h//64), interpolation=cv2.INTER_CUBIC)  
    input_img_color = cv2.resize(input_img_color, (w, h), interpolation=cv2.INTER_NEAREST)
    return input_img_color

UPSCALE_METHODS = ["INTER_NEAREST", "INTER_LINEAR", "INTER_AREA", "INTER_CUBIC", "INTER_LANCZOS4"]
def get_upscale_method(method_str):
    assert method_str in UPSCALE_METHODS, f"Method {method_str} not found in {UPSCALE_METHODS}"
    return getattr(cv2, method_str)

def pad64(x):
    return int(np.ceil(float(x) / 64.0) * 64 - x)

def safer_memory(x):
    # Fix many MAC/AMD problems
    return np.ascontiguousarray(x.copy()).copy()

def resize_image_with_pad(input_image, resolution, upscale_method = "", skip_hwc3=False, mode='edge'):
    if skip_hwc3:
        img = input_image
    else:
        img = HWC3(input_image)
    H_raw, W_raw, _ = img.shape
    if resolution == 0:
        return img, lambda x: x
    k = float(resolution) / float(min(H_raw, W_raw))
    H_target = int(np.round(float(H_raw) * k))
    W_target = int(np.round(float(W_raw) * k))
    img = cv2.resize(img, (W_target, H_target), interpolation=get_upscale_method(upscale_method) if k > 1 else cv2.INTER_AREA)
    H_pad, W_pad = pad64(H_target), pad64(W_target)
    img_padded = np.pad(img, [[0, H_pad], [0, W_pad], [0, 0]], mode=mode)

    def remove_pad(x):
        return safer_memory(x[:H_target, :W_target, ...])

    return safer_memory(img_padded), remove_pad

def draw_contour(img, mask):
    mask_np = mask.numpy().astype(np.uint8) * 255
    img_np = img.numpy()
    img_np = img_np.astype(np.uint8)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    kernel = np.ones((5, 5), np.uint8)
    mask_dilated = cv2.dilate(mask_np, kernel, iterations=3)
    contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        cv2.drawContours(img_bgr, [contour], -1, (0, 0, 255), thickness=10)
    img_np = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    transform = transforms.ToTensor()
    img_tensor = transform(img_np)
    img_tensor = img_tensor.permute(1, 2, 0)

    return img_tensor.unsqueeze(0)

def get_colored_contour(img1, img2, threshold=10):
    diff = torch.abs(img1 - img2).float()
    diff_gray = torch.mean(diff, dim=-1)
    mask = diff_gray > threshold
    return draw_contour(img2, mask), mask

def closest_colour(requested_colour):
    min_colours = {}
    for key, name in webcolors.CSS3_HEX_TO_NAMES.items():
        r_c, g_c, b_c = webcolors.hex_to_rgb(key)
        rd = (r_c - requested_colour[0].item()) ** 2
        gd = (g_c - requested_colour[1].item()) ** 2
        bd = (b_c - requested_colour[2].item()) ** 2
        min_colours[(rd + gd + bd)] = name
    return min_colours[min(min_colours.keys())]

def rgb_to_name(rgb_tuple):
    try:
        return webcolors.rgb_to_name(rgb_tuple)
    except ValueError:
        closest_name = closest_colour(rgb_tuple)
        return closest_name

def find_different_colors(img1, img2, threshold=10):
    img1 = img1.to(torch.uint8)
    img2 = img2.to(torch.uint8)
    diff = torch.abs(img1 - img2).float().mean(dim=-1)
    diff_mask = diff > threshold
    diff_indices = torch.nonzero(diff_mask, as_tuple=True)

    if len(diff_indices[0]) > 100:
        sampled_indices = random.sample(range(len(diff_indices[0])), 100)
        sampled_diff_indices = (diff_indices[0][sampled_indices], diff_indices[1][sampled_indices])
    else:
        sampled_diff_indices = diff_indices

    diff_colors = img2[sampled_diff_indices[0], sampled_diff_indices[1], :]
    color_names = [rgb_to_name(tuple(color)) for color in diff_colors]
    name_counter = Counter(color_names)
    filtered_colors = {name: count for name, count in name_counter.items() if count > 10}
    sorted_color_names = [name for name, count in sorted(filtered_colors.items(), key=lambda item: item[1], reverse=True)]
    if len(sorted_color_names) >= 3:
        return "colorful"
    unique_color_names_str = ', '.join(sorted_color_names)
    return unique_color_names_str

def get_bounding_box_from_mask(mask, padded=False):
    # Ensure the mask is a binary mask (0s and 1s)
    mask = mask.squeeze()
    rows, cols = torch.where(mask > 0.5)
    # If there are no '1's in the mask, return None or an appropriate bounding box like (0,0,0,0)
    if len(rows) == 0 or len(cols) == 0:
        return (0, 0, 0, 0)
    height, width = mask.shape
    if padded:
        padded_size = max(width, height)
        if width < height:
            offset_x = (padded_size - width) / 2
            offset_y = 0
        else:
            offset_y = (padded_size - height) / 2
            offset_x = 0
        # Find the bounding box coordinates
        top_left_x = round(float((torch.min(cols).item() + offset_x) / padded_size), 3)
        bottom_right_x = round(float((torch.max(cols).item() + offset_x) / padded_size), 3)
        top_left_y = round(float((torch.min(rows).item() + offset_y) / padded_size), 3)
        bottom_right_y = round(float((torch.max(rows).item() + offset_y) / padded_size), 3)
    else:
        offset_x = 0
        offset_y = 0

        top_left_x = round(float(torch.min(cols).item() / width), 3)
        bottom_right_x = round(float(torch.max(cols).item() / width), 3)
        top_left_y = round(float(torch.min(rows).item() / height), 3)
        bottom_right_y = round(float(torch.max(rows).item() / height), 3)

    
    return (top_left_x, top_left_y, bottom_right_x, bottom_right_y)