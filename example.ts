import { Context, DanjaValue } from './compiler'

async function main() {
    const context = new Context();

    const bindings = context.getBindings();

    bindings.putFunction({
        name: '출력',
        processor: (args) => {
            console.log(...args.map((arg) => arg.any()));
        }
    });

    bindings.putFunction({
        name: '덧셈',
        processor: (args) => {
            return args.reduce((acc, cur) => acc + cur.number(), 0);
        }
    });

    bindings.putFunction({
        name: 'eval',
        processor: (args) => {
            return eval(args[0].string());
        }
    });

    bindings.putVariable({
        name: 'a',
        value: new DanjaValue(1)
    });

    await context.evaluate(`
    [[
        출력|
            [[
                eval|
                process.versions
            ]] |
            [[a]]
    ]]
    `);
}

main();