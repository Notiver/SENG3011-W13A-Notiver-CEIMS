FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

COPY app/ ${LAMBDA_TASK_ROOT}/app/
COPY utils/ ${LAMBDA_TASK_ROOT}/utils/

# --- NEW: Create the folder and copy the JSON file into it ---
RUN mkdir -p /var/data-retrieval
COPY SUBURB_TO_LGA_DATA.json /var/data-retrieval/SUBURB_TO_LGA_DATA.json

CMD [ "app.main.handler" ]