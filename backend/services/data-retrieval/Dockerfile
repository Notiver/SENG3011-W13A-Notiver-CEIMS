FROM public.ecr.aws/lambda/python:3.12
COPY requirements.txt ${LAMBDA_TASK_ROOT}
RUN pip install -r requirements.txt
COPY app/ ${LAMBDA_TASK_ROOT}/app/
COPY utils/ ${LAMBDA_TASK_ROOT}/utils/

CMD [ "app.main.handler" ]