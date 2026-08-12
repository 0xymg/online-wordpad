"use client";

// Loaded through React.lazy from Editor.tsx so the cropper bundle AND its
// stylesheet are only fetched when the crop dialog actually opens.
import "react-advanced-cropper/dist/style.css";
import { Cropper } from "react-advanced-cropper";

export default Cropper;
