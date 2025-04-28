declare module 'swagger-jsdoc' {
    import { OpenAPIV3 } from 'express-openapi-validator/dist/framework/types';
  
    function swaggerJsdoc(options: {
      definition: OpenAPIV3.Document;
      apis: string[];
    }): OpenAPIV3.Document;
  
    export = swaggerJsdoc;
  }