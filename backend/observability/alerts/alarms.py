import boto3

cloudwatch = boto3.client('cloudwatch', region_name='ap-southeast-2')

def create_alarms():
    functions = [
        'data-collection-function',
        'data-retrieval-function',
        'data-nlp-analytics'
    ]

    for function_name in functions:
        cloudwatch.put_metric_alarm(
            AlarmName=f'{function_name}-high-errors',
            MetricName='Errors',
            Namespace='AWS/Lambda',
            Dimensions=[{'Name': 'FunctionName', 'Value': function_name}],
            Period=300,
            EvaluationPeriods=2,
            Threshold=10,
            ComparisonOperator='GreaterThanThreshold',
            Statistic='Sum'
        )

if __name__ == "__main__":
    create_alarms()
    print("Alarms created successfully")