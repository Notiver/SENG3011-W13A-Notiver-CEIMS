export const MOCK_CHART_DATA = [
  { year: "2019", "Sydney City": 75, Blacktown: 68, Liverpool: 60, "State Avg": 45 },
  { year: "2020", "Sydney City": 70, Blacktown: 72, Liverpool: 65, "State Avg": 48 },
  { year: "2021", "Sydney City": 80, Blacktown: 75, Liverpool: 68, "State Avg": 50 },
  { year: "2022", "Sydney City": 85, Blacktown: 80, Liverpool: 75, "State Avg": 55 },
  { year: "2023", "Sydney City": 88, Blacktown: 85, Liverpool: 80, "State Avg": 58 },
  { year: "2024", "Sydney City": 92, Blacktown: 87, Liverpool: 82, "State Avg": 62 },
];

export const MOCK_RANKING = [
  // HIGH RISK
  { lga: "Sydney City", score: 92, trend: "up" },
  { lga: "Blacktown", score: 87, trend: "up" },
  { lga: "Liverpool", score: 82, trend: "stable" },
  { lga: "Penrith", score: 78, trend: "down" },
  { lga: "Walgett", score: 76, trend: "up" },
  // ELEVATED RISK
  { lga: "Newcastle", score: 62, trend: "stable" },
  { lga: "Parramatta", score: 58, trend: "down" },
  { lga: "Cumberland", score: 45, trend: "up" },
  { lga: "Central Coast", score: 40, trend: "stable" },
  // LOW RISK
  { lga: "Canada Bay", score: 18, trend: "down" },
  { lga: "Ryde", score: 14, trend: "down" },
  { lga: "Willoughby", score: 12, trend: "stable" },
  { lga: "Ku-ring-gai", score: 8, trend: "down" },
];

export const CATEGORIES = [
  { name: "crime", description: "Insights on Crime Articles related to LGA" },
  { name: "housing prices", description: "Investigates headlines about Property Prices" },
  { name: "lifestyle", description: "Distinguishes news trends for health and lifestyle in LGA" },
  { name: "job opportunities", description: "Heatmaps news of Job Oppurtunities" },
];