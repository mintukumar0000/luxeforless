"""Body capture validation and proportion estimates."""

from __future__ import annotations

import io
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image


def _pil_to_cv2(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def validate_body_capture(img: Image.Image) -> dict:
    """
    Validate that a capture frame is suitable for virtual try-on.
    Returns validation result plus estimated body proportion ranges.
    """
    issues: list[str] = []
    estimates: Optional[dict] = None

    cv_img = _pil_to_cv2(img)
    h, w = cv_img.shape[:2]

    # Lighting check — average brightness
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    if brightness < 60:
        issues.append("Lighting is too dim. Move to a brighter area.")
    elif brightness > 230:
        issues.append("Image is overexposed. Reduce direct light on the camera.")

    mp_pose = mp.solutions.pose
    with mp_pose.Pose(
        static_image_mode=True,
        model_complexity=1,
        min_detection_confidence=0.5,
    ) as pose:
        rgb = cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb)

        if not results.pose_landmarks:
            issues.append("No person detected. Stand fully in frame facing the camera.")
            return {"valid": False, "issues": issues, "estimates": None}

        lm = results.pose_landmarks.landmark

        def vis(idx: int) -> bool:
            return lm[idx].visibility > 0.5

        # Required landmarks for full-body try-on
        required = [
            (mp_pose.PoseLandmark.NOSE, "head"),
            (mp_pose.PoseLandmark.LEFT_SHOULDER, "left shoulder"),
            (mp_pose.PoseLandmark.RIGHT_SHOULDER, "right shoulder"),
            (mp_pose.PoseLandmark.LEFT_HIP, "left hip"),
            (mp_pose.PoseLandmark.RIGHT_HIP, "right hip"),
            (mp_pose.PoseLandmark.LEFT_ANKLE, "left ankle"),
            (mp_pose.PoseLandmark.RIGHT_ANKLE, "right ankle"),
        ]

        missing = [name for idx, name in required if not vis(idx.value)]
        if missing:
            issues.append(f"Body parts not visible: {', '.join(missing)}. Step back so your full body is in frame.")

        # Centering check
        nose = lm[mp_pose.PoseLandmark.NOSE.value]
        center_x = nose.x
        if center_x < 0.25 or center_x > 0.75:
            issues.append("Please stand centered in the frame.")

        # Distance check — body height ratio in frame
        ys = [lm[i.value].y for i, _ in required if vis(i.value)]
        body_span = max(ys) - min(ys)
        if body_span < 0.55:
            issues.append("You appear too far from the camera. Step closer.")
        elif body_span > 0.95:
            issues.append("You are too close. Step back slightly.")

        # Pose check — arms should be somewhat down (not crossed)
        l_wrist = lm[mp_pose.PoseLandmark.LEFT_WRIST.value]
        r_wrist = lm[mp_pose.PoseLandmark.RIGHT_WRIST.value]
        l_shoulder = lm[mp_pose.PoseLandmark.LEFT_SHOULDER.value]
        r_shoulder = lm[mp_pose.PoseLandmark.RIGHT_SHOULDER.value]
        l_hip = lm[mp_pose.PoseLandmark.LEFT_HIP.value]
        r_hip = lm[mp_pose.PoseLandmark.RIGHT_HIP.value]

        if l_wrist.y < l_shoulder.y - 0.05 and r_wrist.y < r_shoulder.y - 0.05:
            issues.append("Please lower your arms to your sides for best results.")

        # Estimate proportions as ranges (never exact measurements)
        if not issues:
            shoulder_w = abs(l_shoulder.x - r_shoulder.x) * w
            hip_w = abs(l_hip.x - r_hip.x) * w
            torso_h = abs(((l_shoulder.y + r_shoulder.y) / 2) - ((l_hip.y + r_hip.y) / 2)) * h
            leg_h = abs(((l_hip.y + r_hip.y) / 2) - ((lm[mp_pose.PoseLandmark.LEFT_ANKLE.value].y + lm[mp_pose.PoseLandmark.RIGHT_ANKLE.value].y) / 2)) * h

            # Normalize to relative indices (0-1 scale, not cm — presented as estimates)
            shoulder_ratio = shoulder_w / w
            hip_ratio = hip_w / w
            torso_ratio = torso_h / h

            estimates = {
                "shoulder_width_estimate": {
                    "min": round(shoulder_ratio * 0.9, 3),
                    "max": round(shoulder_ratio * 1.1, 3),
                    "label": "estimated shoulder proportion",
                },
                "chest_estimate": {
                    "min": round(shoulder_ratio * 0.95 * 0.9, 3),
                    "max": round(shoulder_ratio * 0.95 * 1.1, 3),
                    "label": "estimated chest proportion",
                },
                "waist_estimate": {
                    "min": round(hip_ratio * 0.85 * 0.9, 3),
                    "max": round(hip_ratio * 0.85 * 1.1, 3),
                    "label": "estimated waist proportion",
                },
                "hip_estimate": {
                    "min": round(hip_ratio * 0.9, 3),
                    "max": round(hip_ratio * 1.1, 3),
                    "label": "estimated hip proportion",
                },
                "torso_length_estimate": {
                    "min": round(torso_ratio * 0.9, 3),
                    "max": round(torso_ratio * 1.1, 3),
                    "label": "estimated torso proportion",
                },
                "leg_length_estimate": {
                    "min": round((leg_h / h) * 0.9, 3),
                    "max": round((leg_h / h) * 1.1, 3),
                    "label": "estimated leg proportion",
                },
                "disclaimer": "All values are camera-based estimates, not exact measurements.",
            }

    return {"valid": len(issues) == 0, "issues": issues, "estimates": estimates}
