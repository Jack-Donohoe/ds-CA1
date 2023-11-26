import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { MovieReviewsQueryParams } from "../../shared/types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput} from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../../shared/types.schema.json";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => { // Note change
  try {
    console.log("Event: ", event);
    const parameters = event?.pathParameters;
    const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
    const queryParams = event?.queryStringParameters;
    const minRating = queryParams?.minRating;

    if (!movieId) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing movie Id" }),
      };
    }

    let commandInput: QueryCommandInput = {
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "movieId = :m",
      ExpressionAttributeValues: {
        ":m": movieId,
      },
    };

    if(minRating !== undefined){
      commandInput = {
        ...commandInput,
        FilterExpression: "rating >= :r",
        ExpressionAttributeValues: {
          ...commandInput.ExpressionAttributeValues,
          ":r": parseFloat(minRating),
        },
      };
    };

  const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));

    console.log("Command response: ", commandOutput);
    if (!commandOutput.Items) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid movie Id" }),
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
