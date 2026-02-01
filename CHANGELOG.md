# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.3.2] - 2026-02-01

### Alterado
- **Node.js mínimo reduzido** - Requisito de Node.js reduzido de 22.0.0 para 18.0.0
  - Compatível com AWS Lambda Node.js 18 LTS
  - Sem mudanças no código, apenas especificação de engines
  - `@types/node` atualizado para ^18.0.0

### Corrigido
- **DevDependencies** - Adicionados AWS SDK e async-retry como devDependencies
  - Necessário para execução de testes
  - Continuam sendo peerDependencies opcionais para usuários

---

## [1.3.1] - 2025-12-13

### Alterado
- **EventSchema melhorado** - Suporte nativo a schemas aninhados com `SchemaValue`
  - Novo tipo `SchemaValue = ParameterConfig | { [key: string]: SchemaValue }`
  - Permite estruturas mistas como `{ identity: { sub: {...}, claims: { email: {...} } } }`
  - Removidas interfaces desnecessárias (`AppSyncEventSchema`, `AppSyncIdentitySchema`)
  - Código ~100 linhas mais enxuto

---

## [1.3.0] - 2025-12-13

### Adicionado
- **Suporte AppSync** - Novo logger e error handler para resolvers GraphQL
  - `logAppSyncEvent(event, context)` - Logger para eventos AppSync
    - Info: operation (Query/Mutation), fieldName, identity, identityType, argumentKeys
    - Debug: arguments, source, requestHeaders, stash, prev
  - `handleAppSyncError(error)` - Error handler que sempre re-lança (AppSync espera throw)
    - Loga detalhes de `HttpError` antes de re-lançar
    - Erros normais são re-lançados sem log adicional

### Alterado
- **Logging em Error Handlers** - Todos os handlers agora logam erros antes de retornar/re-lançar
  - `handleApiGatewayError` - Loga HttpError antes de retornar response
  - `handleGenericError` (e aliases) - Loga HttpError antes de retornar response genérica
  - Erros desconhecidos são logados antes de re-throw

### Exemplo de Uso
```typescript
import { 
  logAppSyncEvent, 
  handleAppSyncError,
  extractEventParams,
  NotFound 
} from 'awpaki';
import { AppSyncResolverHandler } from 'aws-lambda';

export const resolver: AppSyncResolverHandler<Args, Result> = async (event, context) => {
  logAppSyncEvent(event, context);
  
  try {
    const params = extractEventParams({
      custom: { id: { required: true } }
    }, { custom: event.arguments } as any);
    
    const user = await getUser(params.id);
    if (!user) throw new NotFound('User not found');
    
    return user;
  } catch (error) {
    return handleAppSyncError(error); // Always throws
  }
};
```

---

## [1.2.1] - 2025-12-13

### Alterado
- **HttpErrorStatus refatorado** - Agora é um objeto constante que referencia `HttpStatus`, eliminando duplicação de valores
- Adicionado tipo `HttpErrorStatusType` para tipagem de parâmetros

### Técnico
- `HttpErrorStatus.NOT_FOUND` agora referencia `HttpStatus.NOT_FOUND` internamente
- Garantia de consistência: se `HttpStatus` mudar, `HttpErrorStatus` acompanha automaticamente

---

## [1.2.0] - 2025-12-13

### Adicionado
- **HttpStatus completo** - Enum com todos os códigos HTTP padrão (1xx, 2xx, 3xx, 4xx, 5xx)
  - Códigos informativos: `CONTINUE`, `SWITCHING_PROTOCOLS`, `PROCESSING`
  - Códigos de sucesso: `OK`, `CREATED`, `ACCEPTED`, `NO_CONTENT`, etc.
  - Códigos de redirecionamento: `MOVED_PERMANENTLY`, `FOUND`, `NOT_MODIFIED`, etc.
  - Códigos de erro do cliente: `BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, etc.
  - Códigos de erro do servidor: `INTERNAL_SERVER_ERROR`, `BAD_GATEWAY`, etc.

- **HttpErrorStatus** - Subset de `HttpStatus` contendo apenas códigos de erro com classes mapeadas
  - 12 códigos: 400, 401, 403, 404, 409, 412, 422, 429, 500, 501, 502, 503

- **isValidHttpErrorStatus()** - Valida se um código é um erro HTTP mapeado

### Alterado
- `isValidHttpStatus()` agora valida todos os códigos HTTP (não apenas erros)
- `getHttpStatusName()` retorna `undefined` para códigos de sucesso (sem classe de erro)

### Migração
```typescript
// Antes (v1.1.x)
import { HttpStatus } from 'awpaki';
statusCodeError: HttpStatus.NOT_FOUND

// Depois (v1.2.x) - para statusCodeError, usar HttpErrorStatus
import { HttpStatus, HttpErrorStatus } from 'awpaki';
statusCode: HttpStatus.OK              // Retornos de sucesso
statusCodeError: HttpErrorStatus.NOT_FOUND  // Erros em schemas
```

---

## [1.1.0] - 2025-12-09

### Adicionado
- **Módulo Decoders** - 17 utilitários de validação e transformação para uso com `extractEventParams`

#### Decoders de String
- `trimmedString` - Remove espaços e valida não-vazio
- `trimmedLowerString` - Trim + lowercase
- `alphanumericId` - Valida ID alfanumérico com hífens/underscores

#### Decoders de Número
- `positiveInteger` - Converte para inteiro positivo
- `limitedInteger(min, max)` - Valida inteiro dentro de um range

#### Decoders de JSON
- `urlEncodedJson` - Decodifica JSON URL-encoded
- `jsonString` - Parse de string JSON

#### Decoder de Email
- `validEmail` - Valida formato e normaliza para lowercase

#### Decoder de Enum
- `createEnum(validValues)` - Factory para validação de enum

#### Outros Decoders
- `stringArray` - Filtra array para strings não-vazias
- `stringToBoolean` - Converte "true"/"false"/"1"/"0"/"yes"/"no" para boolean
- `isoDateString` - Valida e normaliza data ISO

#### Decoders Opcionais
- `optionalTrimmedString(default)` - String com valor default
- `optionalInteger(default)` - Inteiro com valor default

### Exemplo de Uso
```typescript
import { extractEventParams, validEmail, trimmedString, createEnum } from 'awpaki';

const params = extractEventParams({
  body: {
    email: { decoder: validEmail },
    name: { decoder: trimmedString },
    status: { decoder: createEnum(['active', 'inactive']) }
  }
}, event);
```

---

## [1.0.0] - 2025-12-08

### Adicionado

#### Módulo Parsers
- `parseJsonBody<T>()` - Parse de JSON body com tratamento de erros e valor default

#### Módulo Errors
- **Classes de Erro HTTP**
  - `HttpError` - Classe base
  - `BadRequest` (400), `Unauthorized` (401), `Forbidden` (403)
  - `NotFound` (404), `Conflict` (409), `PreconditionFailed` (412)
  - `UnprocessableEntity` (422), `TooManyRequests` (429)
  - `InternalServerError` (500), `NotImplemented` (501)
  - `BadGateway` (502), `ServiceUnavailable` (503)

- **HttpStatus enum** - Códigos de status HTTP type-safe
- `createHttpError()` - Factory para criar erros dinamicamente
- `HTTP_ERROR_MAP` - Mapa de status code para classe de erro

#### Módulo Extractors
- `extractEventParams()` - Extração e validação de parâmetros de eventos Lambda
- `ParameterType` enum - Tipos de parâmetros (STRING, NUMBER, BOOLEAN, OBJECT, ARRAY)

#### Módulo Validators
- `isHttpError()` - Type guard para HttpError

#### Módulo Transformers
- `normalizeHeaders()` - Normaliza headers para lowercase

#### Módulo Loggers
- `logApiGatewayEvent()` - Log de eventos API Gateway
- `logSqsEvent()` - Log de eventos SQS
- `logSnsEvent()` - Log de eventos SNS
- `logEventBridgeEvent()` - Log de eventos EventBridge
- `logS3Event()` - Log de eventos S3
- `logDynamoDBStreamEvent()` - Log de eventos DynamoDB Streams

#### Error Handlers
- `handleApiGatewayError()` - Handler para erros em API Gateway
- `handleGenericError()` - Handler genérico para outros triggers
- Aliases: `handleSqsError`, `handleSnsError`, `handleEventBridgeError`, `handleS3Error`, `handleDynamoDBStreamError`

### Características
- 📦 Suporte completo a TypeScript com definições de tipos
- 🧪 147 testes passando
- 📝 Documentação JSDoc completa
- 🗂️ Arquitetura modular por categoria
- 📚 Imports flexíveis (raiz ou categoria)

---

## Tipos de Mudanças

- **Adicionado** - Novas funcionalidades
- **Alterado** - Mudanças em funcionalidades existentes
- **Descontinuado** - Funcionalidades que serão removidas em breve
- **Removido** - Funcionalidades removidas
- **Corrigido** - Correções de bugs
- **Segurança** - Correções de vulnerabilidades
- **Técnico** - Mudanças internas sem impacto na API pública
- **Migração** - Instruções para migrar de versões anteriores
