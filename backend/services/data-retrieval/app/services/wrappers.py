import httpx
import app.config as config

def collect_articles():
    print(f"{config.API_URL}/collect-articles")

    with httpx.Client() as c:
        response = c.get(f"{config.API_URL}/collect-articles")
        
        if response.status_code != 200:
            print(f"Error: Response returned {response.status_code}\n{response.text}")
            return
        
        return response.json()
    
def collect_data():
    with httpx.Client() as c:
        response = c.get(f"{config.PI_URL}/collect-data")

        if response.status_code != 200:
            print(f"Error: Response returned {response.status_code}\n{response.text}")
            return

        return response.json()
