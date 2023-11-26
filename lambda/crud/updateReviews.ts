import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
    try {
        // Print Event
        console.log("Event: ", event);
        const body = event.body ? JSON.parse(event.body) : undefined;
        const parameters = event?.pathParameters;
        const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
        const reviewerName = parameters?.details;

        if (!body) {
            return {
                statusCode: 500,
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({ message: "Missing request body" }),
              };
        }

        let commandInput: UpdateCommandInput = {
            TableName: process.env.TABLE_NAME,
            Key: {movieId, reviewerName},
            UpdateExpression: "set content = :r",
            ExpressionAttributeValues: {
                ":r" : body
            }
        }

        const commandOutput = await ddbDocClient.send(new UpdateCommand(commandInput));
        return {
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Review updated" }),
        };
    } catch (error: any) {
        console.log(JSON.stringify(error));
        return {
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: error.message }),
        };
    }
};

function createDDbDocClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true,
    };
    const unmarshallOptions = {
        wrapNumbers: false,
    };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}