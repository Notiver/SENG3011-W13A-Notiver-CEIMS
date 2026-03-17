"use client";

import { useState } from "react";

export default function DemoPage() {
  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Existing API States
  const [collectionUrl, setCollectionUrl] = useState("");
  const [nlpUrl, setNlpUrl] = useState("");
  const [response, setResponse] = useState<string>("Results will appear here...");
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const cleanUrl = (url: string) => (url.endsWith("/") ? url.slice(0, -1) : url);

  // 1. Standard JSON Endpoint Tester
  const testJsonEndpoint = async (baseUrl: string, method: string, path: string) => {
    if (!baseUrl) {
      setResponse("Please enter the API Gateway URL first.");
      return;
    }
    setLoading(true);
    setResponse(`Sending ${method} request to ${path}...`);

    try {
      const res = await fetch(`${cleanUrl(baseUrl)}${path}`, {
        method: method,
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      setResponse(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. File Upload Tester (POST /upload-data)
  const testFileUpload = async () => {
    if (!collectionUrl) {
      setResponse("Please enter the Collection API URL.");
      return;
    }
    if (!selectedFile) {
      setResponse("Please select an Excel file to upload.");
      return;
    }

    setLoading(true);
    setResponse("Uploading file...");

    const formData = new FormData();
    formData.append("my_file", selectedFile);

    try {
      const res = await fetch(`${cleanUrl(collectionUrl)}/upload-data`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      setResponse(`Upload Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. File Download Tester (GET /collect-data)
  const testFileDownload = async () => {
    if (!collectionUrl) {
      setResponse("Please enter the Collection API URL.");
      return;
    }

    setLoading(true);
    setResponse("Downloading file from S3...");

    try {
      const res = await fetch(`${cleanUrl(collectionUrl)}/collect-data`, {
        method: "GET",
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "collected_data.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      
      setResponse("File download triggered successfully!");
    } catch (error: any) {
      setResponse(`Download Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // --- FAKE LOGIN SCREEN ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 font-sans text-black">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Notiver Login</h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" placeholder="example.name@example.com" className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input type="password" placeholder="••••••••" className="w-full border p-2 rounded" />
            </div>
            <button
              onClick={() => setIsLoggedIn(true)}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN DASHBOARD ---
  return (
    <main className="p-8 max-w-5xl mx-auto font-sans text-black bg-white min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold">Notiver's CEIMS</h1>
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <span className="text-xl font-semibold text-green-700">Welcome, Jane!</span>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="text-sm text-gray-500 hover:text-red-600 underline"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Data Collection Service */}
        <div className="border border-gray-300 p-6 rounded-lg shadow-sm bg-gray-50">
          <h2 className="text-xl font-bold mb-4">Data Collection Service</h2>
          <input
            type="text"
            placeholder="Paste Collection API Gateway URL here"
            className="w-full border border-gray-300 p-2 mb-4 rounded"
            value={collectionUrl}
            onChange={(e) => setCollectionUrl(e.target.value)}
          />
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => testJsonEndpoint(collectionUrl, "GET", "/")} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full">GET /</button>
            </div>

            <div className="border border-gray-200 p-4 rounded bg-white">
              <h3 className="font-semibold mb-2">Excel Operations</h3>
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                className="mb-2 text-sm"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={testFileUpload} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 w-1/2">POST /upload-data</button>
                <button onClick={testFileDownload} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 w-1/2">GET /collect-data</button>
              </div>
            </div>

            <div className="border border-gray-200 p-4 rounded bg-white">
              <h3 className="font-semibold mb-2">Article Scraping</h3>
              <div className="flex gap-2">
                <button onClick={() => testJsonEndpoint(collectionUrl, "POST", "/upload-articles")} className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 w-1/2">POST /upload-articles</button>
                <button onClick={() => testJsonEndpoint(collectionUrl, "GET", "/collect-articles")} className="bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 w-1/2">GET /collect-articles</button>
              </div>
            </div>
          </div>
        </div>

        {/* Data Processing Service */}
        <div className="border border-gray-300 p-6 rounded-lg shadow-sm bg-gray-50">
          <h2 className="text-xl font-bold mb-4">NLP Analytics Service</h2>
          <input
            type="text"
            placeholder="Paste NLP API Gateway URL here"
            className="w-full border border-gray-300 p-2 mb-4 rounded"
            value={nlpUrl}
            onChange={(e) => setNlpUrl(e.target.value)}
          />
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={() => testJsonEndpoint(nlpUrl, "GET", "/")} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full">GET /</button>
            </div>

            <div className="border border-gray-200 p-4 rounded bg-white">
              <h3 className="font-semibold mb-2">NLP Pipeline</h3>
              <div className="flex gap-2 mt-2">
                <button onClick={() => testJsonEndpoint(nlpUrl, "POST", "/process-articles")} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-1/2">POST /process-articles</button>
                <button onClick={() => testJsonEndpoint(nlpUrl, "GET", "/processed-articles")} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 w-1/2">GET /processed-articles</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Response Window */}
      <h2 className="text-xl font-bold mb-2">Server Response</h2>
      <div className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto min-h-[250px] shadow-inner">
        <pre className="text-sm">{loading ? "Waiting for AWS Lambda..." : response}</pre>
      </div>
    </main>
  );
}