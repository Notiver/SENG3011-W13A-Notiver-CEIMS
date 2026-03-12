import pandas as pd
import os

def clean_suburb_data(input_path, output_path):
    """Reads the raw CSV, keeps only necessary columns, and saves a lite version."""
    if not os.path.exists(input_path):
        print(f"Error: Could not find raw file at {input_path}")
        return False

    try:
        df = pd.read_csv(input_path)
        columns_to_keep = ['suburb', 'local_goverment_area', 'postcode']
        df_cleaned = df[columns_to_keep].drop_duplicates()
        df_cleaned.to_csv(output_path, index=False)

        print(f"Success! Created {output_path}")
        return True
    except Exception as e:
        print(f"Failed to clean suburbs: {e}")
        return False