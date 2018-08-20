import { LogEntry } from '@marketprotocol/types';

/**
 * A LogEntry with an addition removed boolean flag to signify
 * the type of the LogEntry as an Event.
 *
 * If removed is true, it means the event does not exist anymore
 * in the logs of that block.
 */
export interface LogEntryEvent extends LogEntry {
  removed: boolean;
}

// similar to LogEntry but unparsed. Every parameter is a string
export interface RawLogEntry {
  logIndex: string | null;
  transactionIndex: string | null;
  transactionHash: string;
  blockHash: string | null;
  blockNumber: number | null;
  address: string;
  data: string;
  topics: string[];
}

export type EventWatcherCallback = (err: null | Error, log?: LogEntryEvent) => void;
