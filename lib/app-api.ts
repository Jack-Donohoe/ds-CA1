import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { reviews } from "../seed/reviews";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from "../shared/utils";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class AppApi extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    // Tables
    const reviewsTable = new dynamodb.Table(this, "ReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "reviewerName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Reviews",
    })

    // Functions
    const getReviewByIdFn = new lambdanode.NodejsFunction(
      this,
      "GetReviewByIdFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/crud/getReviewsById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const getReviewByNameFn = new lambdanode.NodejsFunction(
      this,
      "GetReviewByNameFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/crud/getReviewsByReviewerName.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const getReviewByDetailsFn = new lambdanode.NodejsFunction(
      this,
      "GetReviewByDetailsFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/crud/getReviewsByDetails.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const getAllReviewsFn = new lambdanode.NodejsFunction(
      this,
      "GetAllReviews",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambda/crud/getAllReviews.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: reviewsTable.tableName,
          REGION: 'eu-west-1',
        },
      }
    );

    const newReviewFn = new lambdanode.NodejsFunction(this, "AddReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda/crud/addReview.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const updateReviewFn = new lambdanode.NodejsFunction(this, "UpdateReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda/crud/updateReviews.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    const translateReviewFn = new lambdanode.NodejsFunction(this, "TranslateReviewFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambda/crud/translateReviews.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: reviewsTable.tableName,
        REGION: "eu-west-1",
      },
    });

    new custom.AwsCustomResource(this, "reviewsddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [reviewsTable.tableName]: generateBatch(reviews)
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("reviewsddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [reviewsTable.tableArn],
      }),
    });

    // Permissions
    reviewsTable.grantReadData(getAllReviewsFn)
    reviewsTable.grantReadData(getReviewByIdFn)
    reviewsTable.grantReadData(getReviewByNameFn)
    reviewsTable.grantReadData(getReviewByDetailsFn)
    reviewsTable.grantReadWriteData(newReviewFn)
    reviewsTable.grantReadWriteData(updateReviewFn)
    reviewsTable.grantReadData(translateReviewFn)

    // Add permission to translateReviewFn to use AWS translate features
    translateReviewFn.addToRolePolicy(new PolicyStatement({
      actions: ['translate:TranslateText'],
      resources: ["*"],
    }))

    // REST API 
    const api = new apig.RestApi(this, "RestAPI", {
      description: "assignment api",
      deployOptions: {
        stageName: "dev",
      },
      // 👇 enable CORS
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      },
    });

    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: "./lambda/auth/authorizer.ts",
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    // Endpoint: movies
    const moviesEndpoint = api.root.addResource("movies")

    // Endpoint: movies/reviews
    const allReviewsEndpoint = moviesEndpoint.addResource("reviews")

    // Endpoint: movies/reviews/{reviewerName} - returns all reviews in app with given reviewer name
    const allReviewsNameEndpoint = allReviewsEndpoint.addResource("{reviewerName}")

    // Endpoint: movies/{movieId}
    const movieEndpoint = moviesEndpoint.addResource("{movieId}")

    // Endpoint: movies/{movieId}/reviews - returns all reviews on a specific movie
    const reviewsEndpoint = movieEndpoint.addResource("reviews")

    // Endpoint: movies/{movieId}/reviews/{details} - returns all reviews on a specific movie with given reviewer name or year
    const reviewDetailsEndpoint = reviewsEndpoint.addResource("{details}")

    // Endpoint: /movies/{movieId}/reviews/{reviewerName}/translation?language=code - returns a translated version of a specific review with given reviewer name and movieId
    const translateEndpoint = reviewDetailsEndpoint.addResource("translate")
    
    // GET movies/reviews - return all movie reviews
    allReviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllReviewsFn, { proxy: true })
    )

    // POST movies/reviews - add a movie review
    allReviewsEndpoint.addMethod(
      "POST",
      new apig.LambdaIntegration(newReviewFn, { proxy: true }),{
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    );

    // GET movies/reviews/{reviewerName} - returns all movie reviews written by a given reviewer name
    allReviewsNameEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewByNameFn, { proxy: true })
    )
    
    // GET movies/{movieId}/reviews - returns review for specified movie ID.
    reviewsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewByIdFn, { proxy: true })
    )

    // GET movies/{movieId}/reviews/{details} - returns reviews for specified movie ID and either reviewer name or year.
    reviewDetailsEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getReviewByDetailsFn, { proxy: true })
    )

    // PUT movies/{movieId}/reviews/{details} - updates the movie review with the specified movie id and reviewer name.
    reviewDetailsEndpoint.addMethod(
      "PUT",
      new apig.LambdaIntegration(updateReviewFn, { proxy: true }),{
        authorizer: requestAuthorizer,
        authorizationType: apig.AuthorizationType.CUSTOM,
      }
    )

    // GET movies/{movieId}/reviews/{details}/translate?language= - gets the review with the specified movie id and reviewer name translated to a specific language.
    translateEndpoint.addMethod(
      "GET",
      new apig.LambdaIntegration(translateReviewFn, { proxy: true })
    )
  }
}