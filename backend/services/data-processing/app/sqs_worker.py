import json
import traceback
from app.services.processor_v2 import run_nlp_pipeline


# Runs the Large NLP model from a queue
def sqs_handler(event, context):
    for record in event.get('Records', []):
        try:
            payload = json.loads(record['body'])
            job_id = payload.get('job_id')
            user_id = payload.get('user_id', 'guest_user')
            auth_header = payload.get('auth_header')
            is_ceims = payload.get('is_ceims', False)
            
            print(f"Starting Background NLP Job: {job_id} | User: {user_id}")
            
            # Run the model
            result = run_nlp_pipeline(
                job_id=job_id, 
                user_id=user_id, 
                auth_header=auth_header,
                params={"is_ceims": is_ceims}
            )
            
            if result.get("status") == "error":
                print(f"ERROR inside NLP Pipeline: {result.get('message')}")
            else:
                print(f"SUCCESS: NLP Job {job_id} complete. Saved to S3.")
            
        except Exception as e:
            print(f"CRITICAL ERROR processing NLP SQS record: {e}")
            print(traceback.format_exc())
            
    return {"statusCode": 200, "body": "Processed NLP records"}