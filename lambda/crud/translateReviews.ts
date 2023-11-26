import { APIGatewayProxyHandlerV2 } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";

import * as AWS from "aws-sdk"

const ddbDocClient = createDDbDocClient();

const translate = new AWS.Translate()

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => { // Note change
  try {
    console.log("Event: ", event);
    const parameters = event?.pathParameters;
    const movieId = parameters?.movieId ? parseInt(parameters.movieId) : undefined;
    const reviewerName = parameters?.details;
    const queryParams = event?.queryStringParameters;
    const languageCode = queryParams?.language;

    if (!movieId) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing movie Id" }),
      };
    }

    if (!reviewerName) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Missing reviewer name" }),
      };
    }

    if (!languageCode) {
        return {
          statusCode: 404,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ Message: "Missing language code; please provide a language" }),
        };
    }

    let commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "movieId = :m and reviewerName = :r",
        ExpressionAttributeValues: {
            ":m": movieId,
            ":r": reviewerName,
        }
    };

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

    const translateParams: AWS.Translate.Types.TranslateTextRequest = {
        Text : commandOutput.Items[0].content,
        SourceLanguageCode: "en",
        TargetLanguageCode : languageCode?.toUpperCase(),
    }

    const translatedReview = await translate.translateText(translateParams).promise()

    body.data[0].content = translatedReview.TranslatedText

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