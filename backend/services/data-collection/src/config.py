# configs
"""This file contains constants and configurations used across the application."""

from pydantic_settings import BaseSettings, SettingsConfigDict

VERSION="v1"

# raw column names from the Excel file
RAW_LGA_COL = "Local Government Area"
RAW_OFFENCE_COL = "Offence type"
RAW_RATE_COL = "Rate per 100,000 population Oct 2024 - Sep 2025"
RAW_TREND_COL = "10 year trend and average annual percent change (Oct 2015-Sep 2025)"

# for processing rows in Excel file
PD_ENGINE = 'calamine'
DEFAULT_TIMEZONE = "GMT+11"

# create settings class for AWS S3 settings
# class Settings(BaseSettings):
#     # Define your variables and their types
#     AWS_PROFILE_NAME: str
#     AWS_DEFAULT_REGION: str
#     S3_BUCKET_NAME: str

# # instantiate settings class
# settings = Settings()

# s3 bucket names
S3_BUCKET_NAME="nsw-crime-data-bucket"
EXCEL_BUCKET_NAME = "boscar"
NEWS_BUCKET_NAME = "news"
LINKS_BUCKET_NAME = "links"
NLP_BUCKET_NAME = "nlp_processed"
EXCEL_FILE_NAME = "crime_data.json"