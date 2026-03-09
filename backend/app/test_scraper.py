import requests
import time

def get_yearly_crime_articles(start_year, end_year):
    print(f"🔍 Fetching one NSW crime article per year from {start_year} to {end_year}...\n")
    print("=" * 60)
    
    url = "https://content.guardianapis.com/search"
    
    # Loop through each year sequentially
    for year in range(start_year, end_year + 1):
        params = {
            "q": "NSW AND (police OR crime)", 
            "section": "australia-news",      
            # Dynamically set the date range for the current year in the loop
            "from-date": f"{year}-01-01",        
            "to-date": f"{year}-12-31",          
            "show-fields": "bodyText",        
            "page-size": 1,
            "api-key": "test"                 
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                articles = data.get("response", {}).get("results", [])
                
                if articles:
                    article = articles[0]
                    title = article.get("webTitle")
                    publish_date = article.get("webPublicationDate")
                    body_text = article.get("fields", {}).get("bodyText", "")
                    
                    print(f"YEAR: {year}")
                    print(f"Title: {title}")
                    print(f"Published: {publish_date}")
                    print(f"URL: {article.get('webUrl')}")
                    print(f"Snippet: {body_text[:200]}...\n")
                    print("-" * 60)
                else:
                    print(f"No articles found for {year}.\n")
                    print("-" * 60)
            else:
                print(f"API Error for {year}: {response.status_code}")
                
        except Exception as e:
            print(f"Request failed for {year}: {e}")
            
        time.sleep(2)

# --- Run the Script ---
if __name__ == "__main__":
    # Start at 2021 and end at the current year, 2026
    get_yearly_crime_articles(2021, 2026)