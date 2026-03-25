import { fetchAuthSession } from 'aws-amplify/auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    
    if (token) {
      return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };
    }
    
    return { "Content-Type": "application/json" };
  } catch (error) {
    console.error("No active session found", error);
    return { "Content-Type": "application/json" };
  }
}

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const authHeaders = await getAuthHeaders();

  const mergedHeaders: Record<string, string> = {
    ...authHeaders,
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: mergedHeaders,
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