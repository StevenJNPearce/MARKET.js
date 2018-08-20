export declare type ContractAbi = AbiDefinition[];
export declare type AbiDefinition = FunctionAbi | EventAbi;
export declare type FunctionAbi = MethodAbi | ConstructorAbi | FallbackAbi;
export declare type ConstructorStateMutability = 'nonpayable' | 'payable';
export declare type StateMutability = 'pure' | 'view' | ConstructorStateMutability;
export interface MethodAbi {
  type: AbiType.Function;
  name: string;
  inputs: DataItem[];
  outputs: DataItem[];
  constant: boolean;
  stateMutability: StateMutability;
  payable: boolean;
}
export interface ConstructorAbi {
  type: AbiType.Constructor;
  inputs: DataItem[];
  payable: boolean;
  stateMutability: ConstructorStateMutability;
}
export interface FallbackAbi {
  type: AbiType.Fallback;
  payable: boolean;
}
export interface EventParameter extends DataItem {
  indexed: boolean;
}
export interface EventAbi {
  type: AbiType.Event;
  name: string;
  inputs: EventParameter[];
  anonymous: boolean;
}
export interface DataItem {
  name: string;
  type: string;
  components?: DataItem[];
}

export declare enum AbiType {
  Function = 'function',
  Constructor = 'constructor',
  Event = 'event',
  Fallback = 'fallback'
}
