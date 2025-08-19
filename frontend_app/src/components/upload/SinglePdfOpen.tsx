'use client';

import { useCallback, useRef, useState } from 'react';

interface SinglePdfOpenProps {
	onOpen: (file: File) => void;
}

export default function SinglePdfOpen({ onOpen }: SinglePdfOpenProps) {
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files[0]) {
			const file = e.target.files[0];
			if (file.type !== 'application/pdf') {
				alert('Please choose a PDF file.');
				return;
			}
			setSelectedFile(file);
		}
	}, []);

	const openNow = useCallback(() => {
		if (!selectedFile) return;
		onOpen(selectedFile);
	}, [selectedFile, onOpen]);

	return (
		<div className="w-full max-w-4xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
			<h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">
				Open Single PDF (View Only)
			</h2>
			<p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
				Choose a PDF to preview immediately using Adobe PDF Embed. This file is not uploaded to the backend.
			</p>
			<div className="flex items-center space-x-3">
				<input
					ref={fileInputRef}
					type="file"
					accept=".pdf"
					onChange={handleChange}
					className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
				/>
				<button
					onClick={openNow}
					disabled={!selectedFile}
					className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
				>
					Open Now
				</button>
			</div>
			{selectedFile && (
				<p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
					Selected: {selectedFile.name}
				</p>
			)}
		</div>
	);
}


