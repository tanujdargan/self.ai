import { useState, useCallback, useRef } from "react";
import type { DragEvent } from "react";

interface FileDropZoneProps {
  onFileDrop: (file: File) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFileDrop, disabled }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) onFileDrop(file);
    },
    [onFileDrop, disabled]
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileDrop(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
        transition-colors duration-200
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${
          isDragging
            ? "border-blue-500 bg-blue-500/10"
            : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
        accept=".txt,.json,.csv,.zip,.html,.mbox,.eml"
      />

      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <div>
          <p className="text-zinc-300 font-medium">
            Drop your chat export here
          </p>
          <p className="text-zinc-500 text-sm mt-1">
            or click to browse files
          </p>
        </div>
        <p className="text-zinc-600 text-xs">
          Supports .txt, .json, .csv, .zip, .html, .mbox, .eml
        </p>
      </div>
    </div>
  );
}
