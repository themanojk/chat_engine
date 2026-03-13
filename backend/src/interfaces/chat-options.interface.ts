import { ChatStorageAdapter } from "./chat-storage-adapter.interface";

export interface PostgresStorageOptions {
  type: "postgres";
  connectionString?: string;
  knexConfig?: Record<string, unknown>;
  autoCreateSchema?: boolean;
}

export interface MongoStorageOptions {
  type: "mongo";
  uri: string;
  dbName?: string;
}

export interface InMemoryStorageOptions {
  type: "in-memory";
}

export interface CustomStorageOptions {
  type: "custom";
  adapter: ChatStorageAdapter;
}

export type ChatStorageOptions =
  | PostgresStorageOptions
  | MongoStorageOptions
  | InMemoryStorageOptions
  | CustomStorageOptions;

export interface RedisOptions {
  url?: string;
  enablePresence?: boolean;
  enableSocketSync?: boolean;
}

export interface KafkaOptions {
  brokers: string[];
  clientId?: string;
  topicPrefix?: string;
}

export interface ChatFeatureOptions {
  enableTypingIndicators?: boolean;
  enableReadReceipts?: boolean;
}

export interface ChatOptions {
  tenantResolver: (context: unknown) => string | Promise<string>;
  storage?: ChatStorageOptions;
  redis?: RedisOptions;
  kafka?: KafkaOptions;
  features?: ChatFeatureOptions;
}
