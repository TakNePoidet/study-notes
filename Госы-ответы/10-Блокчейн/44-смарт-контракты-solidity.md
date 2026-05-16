# 44. Создание смарт-контрактов на языке Solidity публикация в приватной сети

[← К группе «Блокчейн»](README.md) · [← Ко всем группам](../README.md)

## План ответа

1. Что такое смарт-контракт и как он работает.
2. Жизненный цикл разработки контракта.
3. Пример простого контракта SimpleStorage.
4. Компиляция и деплой в Remix.
5. Деплой через Hardhat в приватную сеть.
6. Взаимодействие из dApp через ethers.js.
7. Тестирование и безопасность.

## Развёрнутый ответ

### Что такое смарт-контракт

**Смарт-контракт** — это программа, развёрнутая в блокчейне. У контракта есть собственный адрес, баланс ETH и **постоянное состояние**, которое изменяется через транзакции. Контракт — это «автоматический исполнитель»: его код не может быть изменён после деплоя (если только это не upgradeable proxy), и его выполнение детерминированно — все узлы сети получают одинаковый результат.

В Ethereum контракты пишут на **Solidity** (преобладающий язык) или Vyper. Компилируются в **байткод EVM** и деплоятся специальной транзакцией.

### Жизненный цикл разработки

Стандартный workflow:

1. **Написать контракт** на Solidity.
2. **Скомпилировать** (solc) в байткод и ABI.
3. **Протестировать** локально (Hardhat, Foundry).
4. **Задеплоить** на тестовую сеть для интеграционных тестов.
5. **Провести аудит** безопасности.
6. **Задеплоить в продакшен** (mainnet или приватная сеть).
7. **Верифицировать** исходный код в эксплорере (Etherscan).
8. **Использовать** через dApp.

### Пример простого контракта

`SimpleStorage.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleStorage {
    uint256 private value;

    event ValueChanged(address indexed by, uint256 oldVal, uint256 newVal);

    function setValue(uint256 _v) external {
        emit ValueChanged(msg.sender, value, _v);
        value = _v;
    }

    function getValue() external view returns (uint256) {
        return value;
    }
}
```

Разберём:

- **SPDX-License-Identifier** — стандарт обозначения лицензии, рекомендуется всегда указывать.
- **pragma solidity ^0.8.24** — версия компилятора. Solidity активно развивается, важно фиксировать версию.
- **value** — переменная состояния, хранится в storage (постоянное хранилище контракта).
- **event ValueChanged** — событие, эмиттится при изменении. События — это записи в логах транзакции, по которым удобно отслеживать активность.
- **external** — функция вызывается только извне контракта.
- **view** — функция не меняет состояние, можно вызывать бесплатно (через `eth_call`).

### Деплой в Remix IDE

Самый простой способ для обучения:

1. Открыть [remix.ethereum.org](https://remix.ethereum.org/).
2. Создать файл `SimpleStorage.sol`, вставить код.
3. Вкладка **Solidity Compiler** — выбрать версию `0.8.24`, нажать Compile.
4. Вкладка **Deploy & Run Transactions**:
   - Environment: **Injected Provider — MetaMask** (или Remix VM для теста).
   - Account: ваш аккаунт.
   - Contract: SimpleStorage.
   - Нажать **Deploy**, подтвердить в MetaMask.
5. После деплоя контракт появится внизу, можно вызывать его методы.

### Деплой через Hardhat в приватную сеть

Для серьёзной разработки используют Hardhat. Настройка:

`hardhat.config.ts`:

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    private: {
      url: "http://127.0.0.1:8545",
      accounts: ["0xPRIVATE_KEY_HERE"],
      chainId: 12345
    }
  }
};

export default config;
```

`scripts/deploy.ts`:

```typescript
import { ethers } from "hardhat";

async function main() {
  const Storage = await ethers.getContractFactory("SimpleStorage");
  const storage = await Storage.deploy();
  await storage.waitForDeployment();
  console.log("Deployed at:", await storage.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Запуск:

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network private
```

Вывод:

```
Deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Адрес сохраняем — по нему будем обращаться к контракту.

### Взаимодействие из dApp

С помощью библиотеки **ethers.js** (или новее **viem**):

```typescript
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const wallet = new ethers.Wallet("0xPRIVATE_KEY", provider);

const abi = [
  "function getValue() view returns (uint256)",
  "function setValue(uint256)"
];

const contract = new ethers.Contract("0xКОНТРАКТА", abi, wallet);

// Чтение — бесплатно
console.log(await contract.getValue());

// Запись — нужна транзакция
const tx = await contract.setValue(42);
await tx.wait();  // дождаться подтверждения

console.log(await contract.getValue());  // 42
```

В реальном dApp вместо приватного ключа используется MetaMask: пользователь сам подписывает транзакции.

### Тестирование

Тесты в Hardhat с Chai:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SimpleStorage", () => {
  it("stores value", async () => {
    const Storage = await ethers.getContractFactory("SimpleStorage");
    const s = await Storage.deploy();

    await s.setValue(99);
    expect(await s.getValue()).to.equal(99);
  });

  it("emits event", async () => {
    const [user] = await ethers.getSigners();
    const s = await (await ethers.getContractFactory("SimpleStorage")).deploy();

    await expect(s.setValue(10))
      .to.emit(s, "ValueChanged")
      .withArgs(user.address, 0, 10);
  });
});
```

```bash
npx hardhat test
```

В Foundry тесты пишутся прямо на Solidity, что удобно и быстрее.

### Газ и оплата

При деплое и каждой транзакции списывается **газ**. В приватной Clique-сети `gasPrice = 0`, поэтому всё бесплатно — идеально для обучения.

На mainnet деплой стоит реальные деньги (несколько долларов на простой контракт, тысячи — на сложный). Для уменьшения стоимости:

- использовать `external` вместо `public`;
- использовать `custom errors` вместо `require("string")`;
- паковать переменные в один storage slot (32 байта);
- использовать `unchecked { ... }` где переполнение невозможно;
- эмитить события вместо хранения логов в storage.

### Деплой и верификация

После деплоя в публичную сеть полезно **верифицировать** исходный код:

```bash
npx hardhat verify --network sepolia 0xКОНТРАКТА конструктор_арг
```

Это публикует исходники на Etherscan, и любой может проверить, что байткод соответствует коду — основа доверия к контракту.

### Безопасность

Смарт-контракты — это код в производстве, и баги стоят очень дорого. Главные классы уязвимостей:

- **Reentrancy** — внешний вызов перед обновлением состояния. Решение: паттерн checks-effects-interactions, `nonReentrant` модификатор.
- **Integer overflow/underflow** — в Solidity 0.8+ автоматический revert. В блоке `unchecked` — нет.
- **Authorization** — проверять права в каждой функции, не доверять `tx.origin`.
- **Front-running / MEV** — учитывать порядок включения транзакций.
- **Delegatecall** — изменяет storage вызывающего, требует осторожности.

Используйте проверенные библиотеки — **OpenZeppelin** содержит безопасные реализации ERC-20, ERC-721, AccessControl, ReentrancyGuard.

### Что важно сказать в итоге

Смарт-контракт — это программа в блокчейне с собственным состоянием и адресом. Разработка идёт по схеме: написать → скомпилировать → протестировать → задеплоить → верифицировать → использовать. Для обучения хорошо подходит **Remix** + Ganache, для production — **Hardhat** или **Foundry** + узел (приватный для тестов или публичный для прода). После деплоя контракт доступен через ABI и адрес из dApp на ethers.js или viem. Особое внимание — безопасности: reentrancy, authorization, OWASP-аналоги для смарт-контрактов. На приватной сети с газом 0 можно экспериментировать без затрат.
