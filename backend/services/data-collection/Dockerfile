FROM public.ecr.aws/lambda/python:3.12
COPY services/data-collection/requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt
COPY services/data-collection/app/ ${LAMBDA_TASK_ROOT}/app/
COPY observability/ ${LAMBDA_TASK_ROOT}/observability/

CMD [ "app.main.handler" ]