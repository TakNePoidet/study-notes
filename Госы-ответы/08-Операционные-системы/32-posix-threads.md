# 32. Многопоточное программирование. Потоки стандарта POSIX1.c

[← К группе «Операционные системы»](README.md) · [← Ко всем группам](../README.md)

## План ответа

1. Что такое POSIX Threads (pthread).
2. Создание и завершение потоков.
3. Состояния потока: joinable и detached.
4. Синхронизация: мьютексы, условные переменные, rwlock, барьеры.
5. Локальное хранилище потока.
6. Атрибуты, отмена.
7. Современные обёртки.

## Развёрнутый ответ

### Что такое POSIX Threads

**POSIX Threads (pthread)** — это стандарт IEEE POSIX.1c (1995), описывающий программный интерфейс многопоточности в Unix-подобных системах. Реализация называется **pthreads**, и она доступна во всех современных Linux, macOS, BSD.

До pthread у каждой Unix-системы был свой API для потоков. POSIX.1c унифицировал это, и сегодня программа на pthread компилируется и работает практически везде.

API делится на несколько групп: создание и управление потоками, мьютексы, условные переменные, читатель-писатель блокировки, барьеры, отмена, локальное хранилище.

### Создание и завершение

```c
#include <pthread.h>
#include <stdio.h>

void *worker(void *arg) {
    int id = *(int *)arg;
    printf("Hello from thread %d\n", id);
    return NULL;
}

int main(void) {
    pthread_t t1, t2;
    int a = 1, b = 2;

    pthread_create(&t1, NULL, worker, &a);
    pthread_create(&t2, NULL, worker, &b);

    pthread_join(t1, NULL);   // ждём завершения
    pthread_join(t2, NULL);
    return 0;
}
```

Сборка: `gcc -pthread file.c -o app`. Флаг `-pthread` подключает pthread-библиотеку и нужные макросы.

`pthread_create` принимает указатель на переменную типа `pthread_t` (идентификатор потока), атрибуты, функцию-точку входа и аргумент. Функция должна возвращать `void *`.

`pthread_join` ждёт завершения потока и получает его возвращаемое значение.

### Состояния потока

**Joinable** (по умолчанию) — потоку должен быть сделан `pthread_join`. Иначе ресурсы (структуры данных потока) не освобождаются — утечка.

**Detached** — поток освобождает ресурсы сам после завершения. Никто его не «джойнит».

```c
pthread_detach(pthread_self());  // отсоединить себя
```

Если поток сделал свою работу и его никто не будет ждать — лучше его отделить.

### Мьютексы

**Мьютекс (mutual exclusion)** — самый простой примитив синхронизации. Гарантирует, что в критической секции одновременно находится не более одного потока.

```c
pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

pthread_mutex_lock(&lock);
// критическая секция
pthread_mutex_unlock(&lock);

pthread_mutex_destroy(&lock);
```

Типы мьютексов задаются через атрибуты:

- **PTHREAD_MUTEX_NORMAL** — обычный, повторный захват своим потоком — deadlock.
- **PTHREAD_MUTEX_RECURSIVE** — один поток может захватить несколько раз (с тем же числом unlock).
- **PTHREAD_MUTEX_ERRORCHECK** — проверки, возвращает ошибки.
- **PTHREAD_MUTEX_ADAPTIVE_NP** — Linux-расширение, сначала «спинит» (busy-wait), потом блокируется.

### Условные переменные

Мьютекс защищает данные, но не позволяет «ждать события». Для этого есть **условные переменные**.

```c
pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
pthread_cond_t  cv   = PTHREAD_COND_INITIALIZER;
int ready = 0;

// Поток-потребитель: ждёт
pthread_mutex_lock(&lock);
while (!ready)
    pthread_cond_wait(&cv, &lock);  // отпускает lock и ждёт сигнала
// делаем работу
pthread_mutex_unlock(&lock);

// Поток-производитель: сигнализирует
pthread_mutex_lock(&lock);
ready = 1;
pthread_cond_signal(&cv);     // или pthread_cond_broadcast
pthread_mutex_unlock(&lock);
```

Важно: **`while`, а не `if`**. Это защищает от spurious wake-ups — ОС может разбудить ждущий поток без явного сигнала.

`pthread_cond_signal` будит один ждущий поток, `pthread_cond_broadcast` — всех.

### RWLock и барьеры

**Read-Write Lock** — позволяет либо много читателей, либо одного писателя:

```c
pthread_rwlock_t rw = PTHREAD_RWLOCK_INITIALIZER;
pthread_rwlock_rdlock(&rw); /* много читателей */ pthread_rwlock_unlock(&rw);
pthread_rwlock_wrlock(&rw); /* один писатель */  pthread_rwlock_unlock(&rw);
```

Используется, когда чтений намного больше, чем записей.

**Барьер** — точка синхронизации, где все потоки должны встретиться:

```c
pthread_barrier_t bar;
pthread_barrier_init(&bar, NULL, /*count=*/4);

// в каждом из 4 потоков:
pthread_barrier_wait(&bar);

pthread_barrier_destroy(&bar);
```

Когда все четыре потока вызвали `wait`, они одновременно «отпускаются» и продолжают.

### Thread-Local Storage

Иногда нужны данные, у каждого потока свои собственные. Pthread даёт два механизма.

Старый — через ключи:

```c
pthread_key_t key;
pthread_key_create(&key, NULL);
pthread_setspecific(key, ptr);
void *p = pthread_getspecific(key);
```

Новый и удобный — компиляторный `__thread` (GCC) или стандартный `_Thread_local` (C11):

```c
__thread int counter = 0;
```

### Атрибуты потока

Можно задать настройки потока перед созданием:

```c
pthread_attr_t attr;
pthread_attr_init(&attr);
pthread_attr_setstacksize(&attr, 1 << 20);            // 1 MB стек
pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
pthread_create(&t, &attr, worker, NULL);
pthread_attr_destroy(&attr);
```

Также можно настроить scope (system vs process), политику планирования (SCHED_FIFO/SCHED_RR для real-time).

### Отмена потока

```c
pthread_cancel(t);
```

Отмена не происходит мгновенно — поток должен быть в **cancellation point** (вызов `read`, `write`, `sleep`, и др.). Для аккуратной очистки используется `pthread_cleanup_push/pop`:

```c
void cleanup_fn(void *arg) { /* освобождение */ }

pthread_cleanup_push(cleanup_fn, arg);
// работа потока
pthread_cleanup_pop(0);
```

### Современные обёртки

Pthread — это C-API, и писать на нём прямо громоздко. Современные языки предлагают высокоуровневые обёртки.

**C11 threads** (`<threads.h>`) — упрощённый стандартный API.

**C++ `<thread>`, `<mutex>`, `<condition_variable>`** — мощные классы:

```cpp
#include <mutex>
std::mutex m;
{
    std::lock_guard<std::mutex> g(m);  // RAII: auto-unlock при выходе
    // критическая секция
}
```

**OpenMP** — директивы препроцессора `#pragma omp parallel for` для параллелизации циклов.

**POSIX AIO** (`aio_*`) — асинхронный I/O без потоков.

### Лучшие практики

- **Минимизируйте критические секции.** Чем меньше кода под мьютексом, тем меньше конкуренция.
- **Захватывайте мьютексы в одном порядке** во всех потоках, чтобы не было deadlock-ов.
- **Используйте RAII-обёртки** (`std::lock_guard`, `std::unique_lock`) в C++.
- **Предпочитайте высокоуровневые абстракции** — futures/promises, channels, акторы.
- **Профилируйте под нагрузкой** — `perf`, ThreadSanitizer (`-fsanitize=thread`).

### Что важно сказать в итоге

POSIX Threads — это стандартный API многопоточности в Unix-системах. Основные функции: `pthread_create` (создать), `pthread_join` (дождаться), `pthread_detach` (отсоединить). Для синхронизации — мьютексы (`pthread_mutex_*`), условные переменные (`pthread_cond_*`), rwlock, барьеры. Атрибуты управляют стеком, состоянием, политикой планирования. Современная разработка обычно скрывает pthread за обёртками: C++ `<thread>`, Go-горутины, Java-потоки. Но понимание pthread остаётся базой для системного программирования и работы с производительностью.
