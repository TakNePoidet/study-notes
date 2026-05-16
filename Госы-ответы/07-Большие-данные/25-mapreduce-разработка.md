# 25. Разработка приложений MapReduce

[← К группе «Большие данные»](README.md) · [← Ко всем группам](../README.md)

## План ответа

1. Из чего состоит приложение MapReduce.
2. Структура Java-приложения (Word Count).
3. Hadoop Streaming — писать на любом языке.
4. Высокоуровневые альтернативы: Hive, Pig, Spark.
5. Что нужно учитывать: типы Writable, counters, custom partitioner, skew.
6. Тестирование и современный контекст.

## Развёрнутый ответ

### Структура приложения MapReduce

Любое MapReduce-приложение в Hadoop состоит из нескольких частей:

- **Mapper** — реализация функции map;
- **Reducer** — реализация функции reduce;
- опционально — **Combiner** (часто та же самая reduce-функция);
- опционально — **Partitioner** (распределение ключей по reducer-ам);
- **Driver** — главный класс, описывающий конфигурацию job и запускающий его.

Программист в Hadoop пишет это на **Java**, реже на Scala. Альтернатива — Hadoop Streaming, позволяющий писать на Python, Bash, любом языке через stdin/stdout.

### Пример Java-приложения: Word Count

```java
public class WordCount {

  // Mapper: входная строка → пары (слово, 1)
  public static class TokenizerMapper
      extends Mapper<Object, Text, Text, IntWritable> {

    private final Text word = new Text();
    private final IntWritable one = new IntWritable(1);

    public void map(Object key, Text value, Context context)
        throws IOException, InterruptedException {
      for (String token : value.toString().toLowerCase().split("\\W+")) {
        if (!token.isEmpty()) {
          word.set(token);
          context.write(word, one);
        }
      }
    }
  }

  // Reducer: сумма всех счётчиков для каждого слова
  public static class IntSumReducer
      extends Reducer<Text, IntWritable, Text, IntWritable> {

    private final IntWritable result = new IntWritable();

    public void reduce(Text key, Iterable<IntWritable> values, Context context)
        throws IOException, InterruptedException {
      int sum = 0;
      for (IntWritable v : values) sum += v.get();
      result.set(sum);
      context.write(key, result);
    }
  }

  // Driver: описание и запуск job
  public static void main(String[] args) throws Exception {
    Configuration conf = new Configuration();
    Job job = Job.getInstance(conf, "word count");
    job.setJarByClass(WordCount.class);
    job.setMapperClass(TokenizerMapper.class);
    job.setCombinerClass(IntSumReducer.class);   // combiner = reducer
    job.setReducerClass(IntSumReducer.class);
    job.setOutputKeyClass(Text.class);
    job.setOutputValueClass(IntWritable.class);
    FileInputFormat.addInputPath(job, new Path(args[0]));
    FileOutputFormat.setOutputPath(job, new Path(args[1]));
    System.exit(job.waitForCompletion(true) ? 0 : 1);
  }
}
```

Сборка и запуск:

```bash
mvn package
hadoop jar wordcount.jar WordCount /input /output
hdfs dfs -cat /output/part-r-00000 | head
```

Здесь `Text` и `IntWritable` — это **Writable**-типы Hadoop, оптимизированные сериализаторы. Использовать обычные `String` и `int` нельзя — на shuffle нужна эффективная двоичная сериализация.

### Hadoop Streaming

Если не хочется писать на Java, можно использовать **Hadoop Streaming**. Программа читает строки из stdin и пишет пары `key\tvalue` в stdout. Можно использовать Python, Bash, Ruby — что угодно.

```python
# mapper.py
import sys
for line in sys.stdin:
    for token in line.lower().split():
        sys.stdout.write(f"{token}\t1\n")

# reducer.py
import sys
prev, count = None, 0
for line in sys.stdin:
    w, c = line.rstrip().split("\t")
    if prev and w != prev:
        sys.stdout.write(f"{prev}\t{count}\n")
        count = 0
    prev, count = w, count + int(c)
if prev:
    sys.stdout.write(f"{prev}\t{count}\n")
```

Запуск:

```bash
hadoop jar $HADOOP_STREAMING_JAR \
  -input /input -output /output \
  -mapper mapper.py -reducer reducer.py \
  -file mapper.py -file reducer.py
```

Здесь нужно понимать: Hadoop гарантирует, что значения с одинаковым ключом приходят к одному reducer-у **подряд и отсортированы**, поэтому редьюсер-скрипт может полагаться на порядок строк.

### Что нужно учитывать

**Writable-типы.** Hadoop не использует обычную Java-сериализацию (она медленная). Используются специальные классы: `Text`, `IntWritable`, `LongWritable`, `DoubleWritable`, `BytesWritable`. Для пользовательских типов нужно реализовать интерфейс `Writable`.

**Counters.** Встроенные счётчики для метрик задачи — количество строк, пропусков, ошибок. Удобно для отладки и мониторинга.

```java
context.getCounter("CUSTOM", "EMPTY_LINES").increment(1);
```

**Custom Partitioner.** Для распределения данных не по hash, а по другим правилам (например, по диапазонам ключей при сортировке).

**Custom InputFormat / OutputFormat.** Если данные в специальном формате (Avro, Parquet, Sequence File), можно написать свой формат чтения и записи.

**Combiner ≠ reducer всегда.** Если операция не ассоциативна (например, среднее), нельзя просто поставить тот же класс. Combiner может быть вызван 0, 1 или несколько раз — он должен быть «безопасным».

**Skew (перекос ключей).** Если один ключ встречается 90% времени (например, NULL), один reducer будет работать долго, остальные — стоять. Решения: salting ключей, custom partitioner, обработка skewed-значений отдельно.

**Speculative execution.** Hadoop запускает дубли медленных задач на других узлах и берёт результат того, кто финиширует первым. Полезно для узлов «с проблемами», но иногда даёт лишнюю нагрузку.

**Compression.** gzip, snappy, lz4 — для промежуточных и финальных данных. Snappy — хороший компромисс между скоростью и степенью сжатия.

### Высокоуровневые альтернативы

Писать MapReduce руками — это много кода. Поэтому появились высокоуровневые надстройки:

**Apache Hive** — SQL поверх MapReduce. Аналитик пишет SQL, Hive компилирует в job. Сейчас Hive обычно работает на Tez или Spark, а не на MR.

**Apache Pig** — Pig Latin, специальный скриптовый язык для пайплайнов данных. В 2026 году уже редкость.

**Apache Spark** — полная замена MR. RDD/Dataset API, in-memory обработка, на порядок проще писать и часто в 10–100 раз быстрее.

**Apache Flink** — современный движок для streaming и batch.

В 2026 году писать новый код на чистом MapReduce практически не нужно. Spark и Flink покрывают все use-кейсы.

### Тестирование и отладка

**MRUnit** — юнит-тесты маппера и редьюсера в изоляции.

**Локальный mini-cluster** — Hadoop умеет запускаться в режиме «всё в одной JVM», что удобно для интеграционных тестов.

**Web UI YARN и MapReduce History Server** — мониторинг запущенных и завершённых задач.

**Логи**: `yarn logs -applicationId application_xxx`.

### Когда писать MapReduce в 2026

Очень редко. Случаи, когда это всё ещё имеет смысл:
- работа с legacy Hadoop-кластерами;
- очень специфические задачи, где нужен низкоуровневый контроль;
- учебные задачи.

Для новых проектов почти всегда правильный выбор — **Spark** на YARN или Kubernetes, либо более современные fully-managed решения (Databricks, Yandex DataSphere, Snowflake).

Понимание MapReduce полезно и сейчас, потому что Spark внутри использует похожие принципы — стадии, shuffle, отказоустойчивость через переотправку задач.

### Что важно сказать в итоге

Приложение MapReduce состоит из Mapper, Reducer, опциональных Combiner и Partitioner, и Driver-программы, описывающей запуск. Канонический пример — Word Count на Java. Hadoop Streaming позволяет писать на любом языке через stdin/stdout. На практике важно учитывать Writable-типы, counters, skew, compression, custom форматы. Современная разработка избегает чистого MapReduce в пользу Spark, Hive, Flink — но понимание самой модели остаётся фундаментом для работы с распределёнными системами.
