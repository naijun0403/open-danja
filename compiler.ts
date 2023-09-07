export class Context {
    private globalBindings = new GlobalBindings();

    async evaluate(code: string) {
        const lexer = new DanjaLexer(code);
        const tokens = await lexer.lex();

        const parser = new DanjaParser(tokens);
        const ast = await parser.parse();

        const interpreter = new DanjaInterpreter();
        await interpreter.interpret(ast, this);
    }

    getBindings() {
        return this.globalBindings; // realm-like
    }
}

class GlobalBindings {

    private variables: { identifiers: Set<DanjaVariable>, functions: Set<DanjaFunction> } = {
        identifiers: new Set(),
        functions: new Set(),
    };

    putFunction(func: DanjaFunction) {
        this.variables.functions.add(func);
    }

    putVariable(variable: DanjaVariable) {
        if (this.variables.identifiers.has(variable)) throw new Error(`Variable ${variable.name} already exists, please use updateVariable instead`);

        this.variables.identifiers.add(variable);
    }

    updateVariable(variable: DanjaVariable) {
        if (!this.variables.identifiers.has(variable)) throw new Error(`Variable ${variable.name} does not exist, please use putVariable instead`);

        this.variables.identifiers.add(variable);
    }

    getFunction(name: string) {
        for (const func of this.variables.functions) {
            if (func.name === name) return func;
        }
    }

    getVariable(name: string) {
        for (const variable of this.variables.identifiers) {
            if (variable.name === name) return variable;
        }
    }

}

interface DanjaBlock {
    name: string;
    args: DanjaAST[];
}

interface DanjaFunction {
    name: string;
    processor: (args: DanjaValue[]) => unknown;
}

interface DanjaVariable {
    name: string;
    value: DanjaValue;
}

export class DanjaValue {
    constructor(public value: unknown) {}

    private checkType(type: string) {
        if (typeof this.value !== type) {
            throw new Error(`Expected ${type} but got ${typeof this.value}`);
        }
    }

    private checkDanjaBlock(value: unknown): value is DanjaBlock {
        return typeof value === 'object' && value !== null && 'name' in value && 'args' in value;
    }

    string() {
        this.checkType('string');
        return this.value as string;
    }

    number() {
        this.checkType('number');
        return this.value as number;
    }

    boolean() {
        this.checkType('boolean');
        return this.value as boolean;
    }

    array() {
        this.checkType('object');
        return this.value as unknown[];
    }

    danjaBlock() {
        if (!this.checkDanjaBlock(this.value)) {
            throw new Error(`Expected DanjaBlock but got ${typeof this.value}`);
        }
        return this.value as DanjaBlock;
    }

    any() {
        return this.value;
    }
}

enum DanjaTokenKind {
    Value,
    DanjaBlock,
    Function,
    Identifier,
    Operator,
    Keyword,
    Whitespace,
    Newline,
    Comment,
    Unknown,
}

export enum DanjaTokenType {
    // block
    BlockStart = '[', // 이거 2개 있어야함
    BlockEnd = ']',

    // SEPARATOR
    SEPARATOR = '|', // 함수 이름과 인자를 구분하는 구분자 (이거 없으면 그냥 외부 변수로 인식함)
}

export interface DanjaToken {
    kind: DanjaTokenKind;
    type?: DanjaTokenType;
    value: string;
}

export class DanjaLexer {

    private code: string

    constructor(
        _code: string,
    ) {
        this.code = _code + '\0'; // eof
    }

    private currentPos = 0;

    async lex(autoOptimized = true): Promise<DanjaToken[]> {
        const tokens: DanjaToken[] = [];
        let currentToken: string;
        while ((currentToken = this.getNextToken()) !== '\0') {
            const token = this.lexBlock(currentToken);
            if (token) {
                tokens.push(token);
            }
        }
        return autoOptimized ? DanjaOptimizer.optimize(tokens) : tokens;
    }

    private lexBlock(currentToken: string): DanjaToken {
        if (currentToken === DanjaTokenType.BlockStart) {
            return {
                kind: DanjaTokenKind.DanjaBlock,
                type: DanjaTokenType.BlockStart,
                value: currentToken,
            }
        }

        if (currentToken === DanjaTokenType.BlockEnd) {
            return {
                kind: DanjaTokenKind.DanjaBlock,
                type: DanjaTokenType.BlockEnd,
                value: currentToken,
            }
        }

        if (currentToken === DanjaTokenType.SEPARATOR) {
            return {
                kind: DanjaTokenKind.DanjaBlock,
                type: DanjaTokenType.SEPARATOR,
                value: currentToken,
            }
        }

        if (currentToken.match(/\s/)) {
            return;
        }

        if (currentToken.match(/^[가-힣a-zA-Z0-9]+$/)) {
            let value = currentToken;
            while (true) {
                currentToken = this.getNextToken();
                if (currentToken === DanjaTokenType.BlockEnd || currentToken === DanjaTokenType.SEPARATOR) {
                    this.currentPos--;
                    break;
                } else {
                    value += currentToken;
                }
            }
            return {
                kind: DanjaTokenKind.Identifier,
                value,
            }
        }

        throw new Error(`Unexpected token ${currentToken}`);
    }

    private getNextToken(): string {
        return this.code[this.currentPos++];
    }

}

export namespace DanjaOptimizer {

    export function optimize(tokens: DanjaToken[]): DanjaToken[] {
        const optimizedTokens: DanjaToken[] = [];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (token.kind === DanjaTokenKind.Identifier) {
                const beforeToken = tokens[i - 1];
                if (beforeToken.kind === DanjaTokenKind.DanjaBlock && beforeToken.type === DanjaTokenType.SEPARATOR) {
                    optimizedTokens.push({
                        kind: DanjaTokenKind.Value,
                        value: token.value,
                    });
                } else {
                    optimizedTokens.push(token);
                }
            } else {
                optimizedTokens.push(token);
            }
        }
        return optimizedTokens;
    }

}

type DanjaASTType = 'program' | 'function' | 'block' | 'identifier' | 'value';

interface RootDanjaASTNode<T = unknown> {
    type: DanjaASTType;
    value: T;
}

interface DanjaProgramNode extends RootDanjaASTNode<DanjaAST[]> {
    type: 'program';
}

interface DanjaFunctionNode extends RootDanjaASTNode<DanjaBlock> {
    type: 'function';   
}

interface DanjaBlockNode extends RootDanjaASTNode<DanjaBlock> {
    type: 'block';
}

interface DanjaIdentifierNode extends RootDanjaASTNode<string> {
    type: 'identifier';
}

interface DanjaValueNode extends RootDanjaASTNode<string> {
    type: 'value';
}

type DanjaAST = DanjaProgramNode | DanjaFunctionNode | DanjaBlockNode | DanjaIdentifierNode | DanjaValueNode;

export class DanjaParser {

    private tokens: DanjaToken[];

    constructor(
        _tokens: DanjaToken[],
    ) {
        this.tokens = _tokens;
    }

    private currentPos = 0;

    async parse(): Promise<DanjaAST> {
        const asts: DanjaAST = {
            type: 'program',
            value: [],
        }
        let currentToken: DanjaToken;
        while ((currentToken = this.getNextToken()) !== undefined) {
            const ast = this.parseBlock(currentToken);
            if (ast) {
                asts.value.push(ast);
            }
        }
        return asts;
    }

    private parseBlock(currentToken: DanjaToken): DanjaAST {
        if (currentToken.type === DanjaTokenType.BlockStart) {
            return this.parseFunctionOrBlock(currentToken);
        }

        if (currentToken.kind === DanjaTokenKind.Identifier) {
            return {
                type: 'identifier',
                value: currentToken.value,
            }
        }

        if (currentToken.kind === DanjaTokenKind.Value) {
            return {
                type: 'value',
                value: currentToken.value,
            }
        }

        throw new Error(`Unexpected token ${currentToken}`);
    }

    /**
     * ex) [[print|Hello, World!]]
     * @param currentToken 
     */
    private parseFunctionOrBlock(currentToken: DanjaToken): DanjaAST {
        currentToken = this.getNextToken();
        if (currentToken.type !== DanjaTokenType.BlockStart) {
            throw new Error(`Expected ${DanjaTokenType.BlockStart} but got ${currentToken.type}`);
        }
        currentToken = this.getNextToken();
        if (currentToken.kind === DanjaTokenKind.Identifier) {
            const name = currentToken.value;
            currentToken = this.getNextToken();
            if (currentToken.type === DanjaTokenType.SEPARATOR) {
                const args: DanjaAST[] = [];
                while (true) {
                    currentToken = this.getNextToken();
                    if (currentToken.type === DanjaTokenType.BlockEnd) {
                        break;
                    } else {
                        if (currentToken.type === DanjaTokenType.SEPARATOR) {
                            currentToken = this.getNextToken();
                        }

                        args.push(this.parseBlock(currentToken));
                        continue;
                    }
                }
                currentToken = this.getNextToken();
                if (currentToken?.type !== DanjaTokenType.BlockEnd) {
                    throw new Error(`Expected ${DanjaTokenType.BlockEnd} but got ${currentToken?.type}`);
                }
                return {
                    type: 'function',
                    value: {
                        name,
                        args,
                    },
                }
            } else if (currentToken.type === DanjaTokenType.BlockEnd) {
                currentToken = this.getNextToken();
                if (currentToken.type !== DanjaTokenType.BlockEnd) {
                    throw new Error(`Expected ${DanjaTokenType.BlockEnd} but got ${currentToken.type}`);
                }
                return {
                    type: 'block',
                    value: {
                        name,
                        args: [],
                    },
                }
            }
        }
    }

    private getNextToken(): DanjaToken {
        return this.tokens[this.currentPos++];
    }

}

export class DanjaInterpreter {

    async interpret(ast: DanjaAST, context: Context) {
        const bindings = context.getBindings();
        
        if (ast.type !== 'program') throw new Error(`first ast must be program`);

        for (const block of ast.value) {
            if (block.type === 'function') {
                await this.executeFunction(block.value, bindings);
            }
        }
    }

    private async executeFunction(func: DanjaBlock, bindings: GlobalBindings): Promise<unknown> {
        const funcData = bindings.getFunction(func.name);
        if (!funcData) throw new Error(`Function ${func.name} does not exist`);

        const args: DanjaValue[] = [];

        for (const arg of func.args) {
            if (arg.type === 'value') {
                args.push(
                    new DanjaValue(
                        isNaN(Number(arg.value)) ? arg.value : Number(arg.value)
                    )
                )
            } else if (arg.type === 'function') {
                const res = await this.executeFunction(arg.value, bindings);
                args.push(
                    new DanjaValue(
                        isNaN(Number(res)) ? res : Number(res)
                    )
                )
            } else if (arg.type === 'block') {
                args.push(
                    bindings.getVariable(arg.value.name).value
                )
            }
        }

        return funcData.processor(args);
    }

}