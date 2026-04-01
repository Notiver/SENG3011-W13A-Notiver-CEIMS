FROM public.ecr.aws/lambda/python:3.12
COPY services/data-retrieval/requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt
COPY services/data-retrieval/app/ ${LAMBDA_TASK_ROOT}/app/
COPY services/data-retrieval/utils/ ${LAMBDA_TASK_ROOT}/utils/
COPY observability/ ${LAMBDA_TASK_ROOT}/observability/

CMD [ "app.main.handler" ]