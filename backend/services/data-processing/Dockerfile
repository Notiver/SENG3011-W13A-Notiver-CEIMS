FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

COPY app/ ${LAMBDA_TASK_ROOT}/app/
COPY utils/ ${LAMBDA_TASK_ROOT}/utils/

RUN mkdir -p /var/data-retrieval
COPY SUBURB_TO_LGA_DATA.json /var/data-retrieval/SUBURB_TO_LGA_DATA.json

ENV HF_HOME="/tmp/huggingface_cache"
ENV TRANSFORMERS_CACHE="/tmp/transformers_cache"

CMD [ "app.main.handler" ]