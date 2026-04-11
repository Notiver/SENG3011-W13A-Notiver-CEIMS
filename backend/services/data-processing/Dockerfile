FROM public.ecr.aws/lambda/python:3.12

COPY services/data-processing/requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt

COPY services/data-processing/app/ ${LAMBDA_TASK_ROOT}/app/
COPY services/data-processing/utils/ ${LAMBDA_TASK_ROOT}/utils/
COPY observability/ ${LAMBDA_TASK_ROOT}/observability/

RUN mkdir -p /var/data-retrieval/utils
COPY services/data-retrieval/utils/SUBURB_TO_LGA_DATA.json /var/data-retrieval/utils/SUBURB_TO_LGA_DATA.json

ENV HF_HOME="/tmp/huggingface_cache"
ENV TRANSFORMERS_CACHE="/tmp/transformers_cache"

CMD [ "app.main.handler" ]