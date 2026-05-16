# 45. Solidity — Написание умных контрактов на платформе Ethereum

[← К группе «Блокчейн»](README.md) · [← Ко всем группам](../README.md)

## План ответа

1. Что такое Solidity и как он устроен.
2. Базовая структура контракта.
3. Типы данных и хранилище.
4. Видимость, модификаторы, функции.
5. События и пользовательские ошибки.
6. Стандарты токенов (ERC-20, ERC-721, ERC-1155).
7. Газ и оптимизация.
8. Безопасность и тестирование.

## Развёрнутый ответ

### Что такое Solidity

**Solidity** — это статически типизированный, контрактно-ориентированный язык для написания смарт-контрактов под виртуальную машину Ethereum (**EVM**). Разработан Гевином Вудом, Алексеем Акунтьевым и другими в 2014 году. Синтаксис похож на JavaScript, TypeScript и C++, но семантика своя — связана с особенностями блокчейна.

Solidity компилируется в **EVM bytecode**, который потом исполняется на любом EVM-совместимом блокчейне: Ethereum mainnet, Polygon, BSC, Arbitrum, Optimism, Base, Avalanche C-Chain, многие другие.

Альтернатива — **Vyper** (Python-подобный), используется реже, ориентирован на безопасность за счёт простоты.

### Базовая структура контракта

Минимальный пример:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Counter is Ownable(msg.sender) {
    uint256 public count;

    event Incremented(address indexed by, uint256 newValue);
    error CannotDecrement();

    modifier whenPositive() {
        if (count == 0) revert CannotDecrement();
        _;
    }

    function increment() external {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    function decrement() external onlyOwner whenPositive {
        count -= 1;
    }
}
```

Разберём:

- **SPDX-License-Identifier** — лицензия.
- **pragma solidity ^0.8.24** — версия компилятора. `^` означает совместимость с 0.8.x.
- **import** — подключаем OpenZeppelin (стандартная библиотека безопасных контрактов).
- **contract Counter is Ownable** — наследуемся от Ownable, чтобы получить владельца и модификатор `onlyOwner`.
- **uint256 public count** — публичная переменная, автоматически создаётся getter.
- **event Incremented** — событие.
- **error CannotDecrement()** — пользовательская ошибка (дешевле, чем `require("...")`).
- **modifier whenPositive** — модификатор: проверка перед выполнением функции.

### Типы данных

**Value types** (по значению):

- `bool` — true/false;
- `uint8..256` (uint без числа = uint256) — беззнаковое целое;
- `int8..256` — знаковое целое;
- `address` — Ethereum-адрес (20 байт); есть `address payable` для приёма ETH;
- `bytes1..32` — фиксированные байтовые массивы;
- `enum` — перечисление.

**Reference types** (по ссылке):

- `string` — UTF-8 строка;
- `bytes` — динамический массив байт;
- массивы (`uint[]`, `uint[5]`);
- `struct` — пользовательская структура;
- `mapping(K => V)` — ассоциативный массив.

```solidity
struct User {
    string name;
    uint256 balance;
}

mapping(address => User) public users;
mapping(address => mapping(address => uint256)) public allowance;
uint256[] public history;
```

**Mapping** в Solidity — особый: его нельзя итерировать. Если нужно перебрать ключи, ведите отдельный массив или Set.

### Хранилище — три места

В Solidity данные могут находиться в одном из трёх мест:

- **storage** — постоянное хранилище контракта в блокчейне. Самое дорогое. Все переменные состояния — в storage.
- **memory** — временная память для текущего вызова. Сбрасывается после завершения.
- **calldata** — параметры функции при внешнем вызове, только для чтения.

```solidity
function process(uint256[] calldata input) external {
    uint256[] memory copy = input;   // копия в memory
    // ...
}
```

Понимание разницы критично для оптимизации газа.

### Видимость и модификаторы

Модификаторы видимости для функций и переменных:

- **public** — доступно всем (внутри и снаружи).
- **private** — только внутри этого контракта (не наследуется).
- **internal** — внутри и наследниках.
- **external** — только извне (другие контракты или пользователи).

Модификаторы для функций по поведению:

- **view** — не меняет состояние (только читает).
- **pure** — не читает и не меняет состояние.
- **payable** — может принимать ETH.

```solidity
function transfer(address to, uint256 amount) external returns (bool) { /* ... */ }
function balanceOf(address account) external view returns (uint256) { /* ... */ }
function deposit() external payable { /* msg.value — присланный ETH */ }
```

### События и логи

События записываются в **логи блока** при выполнении транзакции. Они дешевле, чем хранение в storage, и удобны для мониторинга вне блокчейна.

```solidity
event Transfer(address indexed from, address indexed to, uint256 value);

emit Transfer(msg.sender, to, amount);
```

`indexed` параметры (до 3 на событие) попадают в **topics** лога — по ним можно фильтровать. Остальные — в data.

Внешние приложения подписываются на события через web3-провайдеры (subgraph, ethers.js, viem).

### Стандарты токенов

Главное преимущество Ethereum — **стандарты**, по которым пишутся совместимые контракты. Любая биржа или кошелёк работает с токеном, если он соответствует стандарту.

**ERC-20** — взаимозаменяемые токены (валюты, акции, баллы лояльности):

```solidity
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
```

**ERC-721** — невзаимозаменяемые токены (NFT), каждый уникален. Каждый токен имеет ID и владельца.

**ERC-1155** — мультитокен, объединяет ERC-20 и ERC-721. Один контракт может управлять и взаимозаменяемыми, и уникальными токенами. Используется в играх.

**ERC-4626** — стандарт vault-токенов для yield-производства.

**ERC-2612 (Permit)** — подпись для approve без транзакции.

Готовые реализации — в **OpenZeppelin Contracts**:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor(uint256 supply)
        ERC20("MyToken", "MTK")
        Ownable(msg.sender)
    {
        _mint(msg.sender, supply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

20 строк кода — и у нас полноценный токен.

### Газ и оптимизация

Каждая инструкция EVM стоит газ. На mainnet это реальные деньги. Главные техники оптимизации:

- **Минимизировать SSTORE** — самая дорогая операция.
- **Pack-ить переменные** в один storage slot (32 байта): `uint128 a; uint128 b;` помещаются в один слот.
- **`external` дешевле `public`** при вызове извне.
- **Custom errors** вместо `require("string")`: `error Foo(); ... revert Foo();`. Экономия — десятки газа.
- **`unchecked { ... }`** для счётчиков, где переполнение невозможно.
- **Использовать events вместо storage** для логов и истории.
- **calldata** вместо memory для входных параметров.

### Безопасность

Smart-контракты часто хранят миллионы долларов. Главные классы уязвимостей:

- **Reentrancy** — внешний вызов перед обновлением состояния. Используйте `ReentrancyGuard` или паттерн **checks-effects-interactions**.
- **Integer overflow/underflow** — в 0.8+ автоматически revert; `unchecked` снимает проверку.
- **tx.origin для authorization** — антипаттерн, используйте `msg.sender`.
- **Front-running / MEV** — учитывать в дизайне (commit-reveal, slippage protection).
- **Delegatecall** — может изменить storage вызывающего; опасно.
- **Upgrade safety** — при использовании прокси осторожно с порядком переменных в storage.

Лучшие практики:

- использовать **OpenZeppelin Contracts** для базовой функциональности;
- статический анализ: **Slither**, **Mythril**, **Aderyn**;
- fuzz-testing: **Foundry invariants**, **Echidna**;
- symbolic execution: **Halmos**, **hevm**;
- внешний **аудит** перед mainnet;
- **bug bounty** программы (Immunefi).

### Тестирование

В Hardhat — на JS/TS:

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MyToken", () => {
  it("mints initial supply to owner", async () => {
    const [owner] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MyToken");
    const t = await Token.deploy(1000);
    expect(await t.balanceOf(owner.address)).to.equal(1000);
  });
});
```

В Foundry — на Solidity:

```solidity
import "forge-std/Test.sol";
import "../src/MyToken.sol";

contract MyTokenTest is Test {
    MyToken token;

    function setUp() public {
        token = new MyToken(1000);
    }

    function testInitialBalance() public {
        assertEq(token.balanceOf(address(this)), 1000);
    }
}
```

Foundry-тесты быстрее и удобнее для контрактов.

### Современные тенденции

- **Account Abstraction (ERC-4337)** — кошельки как смарт-контракты, мультиподписи и социальное восстановление.
- **L2 (Optimism, Arbitrum, Base, zkSync, Starknet)** — масштабирование Ethereum с EVM-совместимостью.
- **EIP-7702** (2024) — временная делегация EOA к контракту, шаг к AA.
- **Cancun upgrade** (март 2024) — `blobhash`, transient storage (`tload`/`tstore`), proto-danksharding для удешевления L2.
- **Solidity 0.8.x** активно развивается: новые проверки, оптимизации, языковые конструкции.

### Что важно сказать в итоге

Solidity — это статически типизированный язык для смарт-контрактов на EVM. Базовые сущности — контракт, переменные состояния, функции, модификаторы, события, ошибки. Типы данных делятся на value (uint, address, bool) и reference (string, array, struct, mapping). Хранилище — storage (постоянное), memory (временное), calldata (входные параметры). Стандарты ERC-20, ERC-721, ERC-1155 определяют совместимые токены, готовые реализации — в OpenZeppelin. Главные темы — оптимизация газа и безопасность (reentrancy, authorization, overflow). Современная разработка движется к Account Abstraction и L2-сетям, упрощая опыт пользователей и снижая стоимость операций.
