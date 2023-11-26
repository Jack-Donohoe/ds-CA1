import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => { // Note change
  try {
    console.log("Event: ", event);
    const parameters = event?.pathParameters;
    const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
    const details = parameters?.details;

    if (!movieId) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing movie Id" }),
      };
    }

    if (!details) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing details" }),
      };
    }

    const regex = new RegExp("20[0-9][0-9]")

    let commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m and reviewerName = :r",
        ExpressionAttributeValues: {
            ":m": movieId,
            ":r": details,
        }
    };

    if (regex.test(details)){
      commandInput = {
        ...commandInput,
        KeyConditionExpression: "movieId = :m and begins_with(reviewDate, :y)",
        ExpressionAttributeValues: {
            ":m": movieId,
            ":y": details,
        }
      }
    }

    const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));
    
    console.log("GetCommand response: ", commandOutput);
    if (!commandOutput.Items) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid movie Id or Reviewer Name" }),
      };
    }
    let body = {
      data: commandOutput.Items,
    };

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ body }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
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
