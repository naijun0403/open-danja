# 단자응 유사 동작기...?
채자봇의 단순 자동 응답 언어...? 구조가 어떻게 동작하는지 엿보기 구멍

## 예제
```typescript
import { Context } from 'compiler'

const context = new Context();

const bindings = context.getBindings();

bindings.putFunction({
    name: '출력',
    processor(args: DanjaValue[]) {
        console.log(...args.map(e => e.any()))
    }
})

context.evaluate(`
[[출력|12]]
`)
```

> 12