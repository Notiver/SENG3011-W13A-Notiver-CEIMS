const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }

  if (response.headers.get("content-type")?.includes("application/octet-stream")) {
    return response.blob(); 
  }

  return response.json();
}

export const api = {
  // --- DATA COLLECTION ---
  collectArticles: () => 
    fetchAPI("/data-collection/collect-articles", { method: "GET" }),

  // --- DATA PROCESSING (NLP) ---
  processArticles: () => 
    fetchAPI("/data-processing/process-articles", { method: "POST" }),
    
  getProcessedArticles: () => 
    fetchAPI("/data-processing/processed-articles", { method: "GET" }),

  // --- DATA RETRIEVAL ---
  runRetrieval: () => 
    fetchAPI("/data-retrieval/run-retrieval", { method: "POST" }),

  getAllLgas: () => 
    fetchAPI("/data-retrieval/lgas", { method: "GET" }),

  getLgaStats: (lga: string) => 
    fetchAPI(`/data-retrieval/lga/${encodeURIComponent(lga)}`, { method: "GET" }),

  getLgaYearlyStats: (lga: string) => 
    fetchAPI(`/data-retrieval/lga/${encodeURIComponent(lga)}/yearly`, { method: "GET" }),
};