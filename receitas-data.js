/* =========================================================================
   SABOR — base de dados de receitas (100% offline)
   ========================================================================= */

const CATS = [
  {k:'cafe',    l:'Café da manhã',   ic:'🍳'},
  {k:'lancheM', l:'Lanche da manhã', ic:'🍎'},
  {k:'almoco',  l:'Almoço',          ic:'🍽️'},
  {k:'lancheT', l:'Lanche da tarde', ic:'🥪'},
  {k:'jantar',  l:'Jantar',          ic:'🌙'},
  {k:'ceia',    l:'Ceia',            ic:'🍮'},
];

const DIFS = {
  facil:    {l:'Fácil',    c:'#4ade80'},
  medio:    {l:'Médio',    c:'#ffb400'},
  complexo: {l:'Complexo', c:'#ff7a9c'},
};

const TAGL = {
  saudavel:'Saudável', vegetariano:'Vegetariano', vegano:'Vegano', lowcarb:'Low carb',
  semgluten:'Sem glúten', proteico:'Proteico', rapido:'Rápido', doce:'Doce',
  fitness:'Fitness', comfort:'Comfort food'
};
const TAG_FILTERS = ['saudavel','vegetariano','vegano','lowcarb','semgluten','proteico','rapido','doce','fitness','comfort'];

/* refeicao(s), dificuldade, minutos, porcoes, kcal(por porção), tags, emoji */
const RECIPES = [

/* ---------------- CAFÉ DA MANHÃ ---------------- */
{id:'r1', nome:'Panqueca americana fofinha', ref:['cafe'], dif:'facil', min:20, porc:2, kcal:320, tags:['doce','rapido'], emoji:'🥞',
 ing:['2 ovos','1 xícara de farinha de trigo','1 xícara de leite','2 colheres de sopa de açúcar','1 colher de sopa de manteiga derretida','1 colher de chá de fermento em pó','1 pitada de sal'],
 modo:['Bata os ovos com o leite e a manteiga derretida.','Misture a farinha, o açúcar, o fermento e o sal e junte aos líquidos, mexendo até ficar homogêneo, sem bater demais (pequenos grumos deixam a panqueca mais fofa).','Aqueça uma frigideira antiaderente em fogo médio e unte levemente.','Despeje uma concha da massa e espere formar bolhas na superfície antes de virar.','Vire e doure do outro lado por cerca de 1 minuto.','Sirva empilhadas com mel, frutas ou calda de chocolate.'],
 dica:'Não mexa demais a massa: pequenos grumos garantem panquecas mais fofas.'},

{id:'r2', nome:'Omelete simples de queijo e tomate', ref:['cafe'], dif:'facil', min:10, porc:1, kcal:280, tags:['proteico','rapido','vegetariano'], emoji:'🍳',
 ing:['2 ovos','30 g de queijo muçarela ralado','1 tomate picado sem sementes','1 colher de sopa de cebolinha picada','1 colher de chá de azeite','Sal e pimenta a gosto'],
 modo:['Bata os ovos com sal e pimenta até ficarem homogêneos.','Aqueça o azeite em uma frigideira pequena antiaderente em fogo médio-baixo.','Despeje os ovos e deixe firmar levemente nas bordas.','Espalhe o tomate e o queijo sobre metade da omelete.','Dobre a omelete ao meio e cozinhe mais 1 minuto até o queijo derreter.','Finalize com a cebolinha e sirva imediatamente.'],
 dica:'Fogo baixo é o segredo para uma omelete macia por dentro e não borrachuda.'},

{id:'r3', nome:'Vitamina de banana com aveia', ref:['cafe','lancheM'], dif:'facil', min:5, porc:1, kcal:250, tags:['saudavel','rapido','vegetariano'], emoji:'🥤',
 ing:['1 banana madura','1 copo de leite (200 ml)','2 colheres de sopa de aveia em flocos','1 colher de chá de mel','Canela a gosto'],
 modo:['Coloque a banana, o leite, a aveia e o mel no liquidificador.','Bata por cerca de 1 minuto até ficar cremoso.','Sirva em um copo grande com uma pitada de canela por cima.'],
 dica:'Congele a banana em rodelas antes: a vitamina fica na consistência de um milk-shake.'},

{id:'r4', nome:'Pão de queijo mineiro', ref:['cafe'], dif:'medio', min:40, porc:6, kcal:180, tags:['vegetariano','semgluten'], emoji:'🧀',
 ing:['500 g de polvilho azedo','1 xícara de leite','0,5 xícara de óleo','2 ovos','200 g de queijo meia cura ralado','1 colher de chá de sal'],
 modo:['Ferva o leite com o óleo e o sal.','Despeje ainda quente sobre o polvilho em uma tigela e misture com uma colher até esfriar um pouco.','Adicione os ovos, um de cada vez, sovando bem com as mãos até incorporar.','Junte o queijo ralado e amasse até formar uma massa lisa e elástica (pode ficar meio grudenta, é normal).','Modele bolinhas do tamanho de uma noz e disponha em uma assadeira untada.','Asse a 200°C por 25-30 minutos até dourarem por fora e ficarem ocas por dentro.'],
 dica:'Se a massa grudar demais nas mãos, unte-as com um pouco de óleo antes de modelar.'},

{id:'r5', nome:'Mingau de aveia com frutas vermelhas', ref:['cafe'], dif:'facil', min:10, porc:1, kcal:290, tags:['saudavel','vegetariano'], emoji:'🥣',
 ing:['0,5 xícara de aveia em flocos','1 xícara de leite (ou bebida vegetal)','1 colher de sopa de mel','0,5 xícara de morango ou mirtilo picados','Canela a gosto'],
 modo:['Em uma panela pequena, aqueça o leite em fogo médio sem ferver.','Adicione a aveia e mexa sem parar por 3-4 minutos até engrossar.','Desligue o fogo e misture o mel.','Sirva em uma tigela coberto com as frutas vermelhas e canela.'],
 dica:'Troque o leite por leite de coco para uma versão mais cremosa e sem lactose.'},

{id:'r6', nome:'Tapioca recheada com queijo e presunto', ref:['cafe','lancheT'], dif:'facil', min:10, porc:1, kcal:260, tags:['rapido','semgluten'], emoji:'🫓',
 ing:['4 colheres de sopa de goma de tapioca hidratada','2 fatias de queijo muçarela','2 fatias de presunto','1 pitada de sal'],
 modo:['Peneire a goma de tapioca sobre uma frigideira antiaderente já quente, formando uma camada fina e uniforme.','Deixe firmar por cerca de 1 minuto em fogo médio até a base soltar da frigideira.','Vire com cuidado e adicione o queijo e o presunto sobre metade do disco.','Dobre ao meio e pressione levemente até o queijo derreter.','Retire e sirva quente.'],
 dica:'A goma está pronta quando gruda ao apertar entre os dedos, mas não fica melada.'},

{id:'r7', nome:'Bolo de banana fit sem açúcar', ref:['cafe','lancheT'], dif:'medio', min:50, porc:8, kcal:150, tags:['saudavel','fitness','vegetariano'], emoji:'🍌',
 ing:['3 bananas maduras amassadas','3 ovos','0,5 xícara de óleo','1,5 xícara de farinha de aveia','1 colher de sopa de fermento em pó','1 colher de chá de canela'],
 modo:['Pré-aqueça o forno a 180°C e unte uma forma de bolo.','Bata as bananas, os ovos e o óleo no liquidificador até obter um creme homogêneo.','Em uma tigela, misture a farinha de aveia e a canela.','Junte o líquido aos secos e mexa delicadamente até incorporar.','Por último, adicione o fermento e misture rapidamente.','Despeje na forma e asse por cerca de 35-40 minutos, até o palito sair limpo.'],
 dica:'Quanto mais maduras as bananas (com pintinhas pretas), mais doce o bolo fica naturalmente.'},

/* ---------------- LANCHE DA MANHÃ ---------------- */
{id:'r8', nome:'Mix de castanhas e frutas secas', ref:['lancheM'], dif:'facil', min:5, porc:4, kcal:180, tags:['saudavel','rapido','vegano'], emoji:'🥜',
 ing:['0,5 xícara de castanha-do-pará','0,5 xícara de amêndoas','0,5 xícara de nozes','0,5 xícara de damasco seco picado','0,5 xícara de passas'],
 modo:['Misture todas as castanhas e frutas secas em um pote com tampa.','Divida em porções individuais de 1 punhado (cerca de 30 g).','Guarde em local seco e consuma ao longo da semana.'],
 dica:'Torre as castanhas por 5 minutos no forno antes de misturar para intensificar o sabor.'},

{id:'r9', nome:'Iogurte com granola e mel', ref:['lancheM','ceia'], dif:'facil', min:5, porc:1, kcal:220, tags:['rapido','saudavel','vegetariano'], emoji:'🥣',
 ing:['1 pote de iogurte natural (170 g)','3 colheres de sopa de granola','1 colher de sopa de mel','5 morangos fatiados'],
 modo:['Coloque o iogurte em uma tigela ou copo.','Adicione a granola e os morangos fatiados.','Finalize com um fio de mel por cima.'],
 dica:'Monte em camadas dentro de um pote de vidro para levar pronto de lanche.'},

{id:'r10', nome:'Barrinha de cereal caseira', ref:['lancheM','lancheT'], dif:'medio', min:35, porc:8, kcal:160, tags:['saudavel','fitness'], emoji:'🍫',
 ing:['2 xícaras de aveia em flocos','0,5 xícara de mel','2 colheres de sopa de pasta de amendoim','0,5 xícara de castanhas picadas','0,5 xícara de frutas secas picadas','1 pitada de sal'],
 modo:['Pré-aqueça o forno a 160°C e forre uma forma retangular com papel manteiga.','Em uma panela, aqueça o mel e a pasta de amendoim em fogo baixo até ficar líquido e homogêneo.','Fora do fogo, misture a aveia, as castanhas, as frutas secas e o sal.','Despeje na forma e pressione bem firme com as costas de uma colher.','Asse por 15-18 minutos até dourar levemente nas bordas.','Deixe esfriar completamente antes de cortar em barras — isso evita que esfarelem.'],
 dica:'Leve à geladeira por 20 minutos antes de cortar: as barras ficam bem mais firmes.'},

{id:'r11', nome:'Smoothie verde detox', ref:['lancheM'], dif:'facil', min:5, porc:1, kcal:140, tags:['saudavel','vegano','rapido'], emoji:'🥬',
 ing:['1 folha de couve sem o talo','1 maçã verde picada','0,5 pepino picado','200 ml de água de coco','Suco de 1 limão','Gengibre a gosto'],
 modo:['Coloque todos os ingredientes no liquidificador.','Bata por 1-2 minutos até ficar bem liso.','Coe se preferir uma textura mais fina e sirva gelado.'],
 dica:'Bata a couve primeiro com o líquido antes de adicionar o resto: evita pedaços de fibra na bebida.'},

{id:'r12', nome:'Banana com pasta de amendoim', ref:['lancheM','lancheT'], dif:'facil', min:3, porc:1, kcal:210, tags:['rapido','proteico','vegano'], emoji:'🍌',
 ing:['1 banana','1 colher de sopa de pasta de amendoim integral','Canela a gosto'],
 modo:['Corte a banana ao meio no sentido do comprimento.','Espalhe a pasta de amendoim sobre as metades.','Polvilhe canela por cima e sirva.'],
 dica:'Congele por 30 minutos para um lanche cremoso tipo "sorvete" de banana.'},

{id:'r13', nome:'Bolinho de maçã e canela assado', ref:['lancheM','lancheT'], dif:'medio', min:35, porc:6, kcal:170, tags:['saudavel','vegetariano'], emoji:'🍎',
 ing:['2 maçãs raladas com casca','2 ovos','1,5 xícara de farinha de aveia','3 colheres de sopa de mel','1 colher de sopa de canela','1 colher de sopa de fermento em pó'],
 modo:['Pré-aqueça o forno a 180°C e forre uma forma de cupcakes com forminhas de papel.','Misture as maçãs raladas, os ovos e o mel em uma tigela.','Junte a farinha de aveia e a canela, mexendo até formar uma massa espessa.','Adicione o fermento por último e misture rapidamente.','Distribua a massa nas forminhas até 2/3 da altura.','Asse por 20-22 minutos até dourarem e o palito sair limpo.'],
 dica:'Ralar a maçã com casca deixa os bolinhos mais úmidos e com mais fibras.'},

{id:'r14', nome:'Ovo cozido com torrada integral e abacate', ref:['lancheM','cafe'], dif:'facil', min:12, porc:1, kcal:300, tags:['proteico','saudavel'], emoji:'🥑',
 ing:['2 ovos','2 fatias de pão integral','0,5 abacate','Suco de limão a gosto','Sal e pimenta a gosto'],
 modo:['Coloque os ovos em uma panela com água e cozinhe por 9-10 minutos após levantar fervura para gema firme.','Resfrie os ovos em água fria, descasque e corte ao meio.','Toste as fatias de pão integral.','Amasse o abacate com limão, sal e pimenta e espalhe sobre as torradas.','Finalize com os ovos cozidos por cima.'],
 dica:'Para uma gema cremosa (ponto mollet), cozinhe por apenas 6-7 minutos.'},

/* ---------------- ALMOÇO ---------------- */
{id:'r15', nome:'Arroz, feijão e frango grelhado (prato feito)', ref:['almoco'], dif:'facil', min:35, porc:2, kcal:520, tags:['saudavel','proteico'], emoji:'🍚',
 ing:['1 xícara de arroz branco','1 xícara de feijão cozido','2 filés de peito de frango','1 dente de alho picado','1 colher de sopa de azeite','Sal, pimenta e temperos a gosto'],
 modo:['Tempere os filés de frango com sal, pimenta e alho picado e deixe descansar 10 minutos.','Para o arroz, refogue um pouco de alho no azeite, junte o arroz lavado e refogue por 2 minutos, adicione água (2x o volume do arroz) e cozinhe em fogo baixo com a panela tampada por 15-18 minutos.','Aqueça o feijão já cozido com um fio de azeite e ajuste o sal.','Grelhe o frango em uma frigideira quente com um fio de azeite, cerca de 5-6 minutos de cada lado até dourar e cozinhar por dentro.','Sirva o arroz e o feijão acompanhados do frango fatiado e, se quiser, uma salada verde.'],
 dica:'Deixe o arroz descansar 5 minutos tampado após desligar o fogo: os grãos ficam mais soltinhos.'},

{id:'r16', nome:'Strogonoff de frango cremoso', ref:['almoco','jantar'], dif:'medio', min:35, porc:4, kcal:480, tags:['comfort'], emoji:'🍛',
 ing:['500 g de peito de frango em cubos','1 cebola picada','2 dentes de alho picados','200 g de champignon fatiado','3 colheres de sopa de ketchup','1 colher de sopa de mostarda','200 g de creme de leite','1 colher de sopa de manteiga','Sal e pimenta a gosto'],
 modo:['Tempere o frango com sal e pimenta.','Na manteiga, refogue a cebola e o alho até ficarem transparentes.','Adicione o frango e doure por todos os lados, cerca de 6-8 minutos.','Junte o champignon e refogue mais 3 minutos.','Acrescente o ketchup e a mostarda, misture bem e deixe apurar por 2 minutos.','Baixe o fogo, adicione o creme de leite e mexa até engrossar levemente, sem ferver.','Sirva com arroz branco e batata palha.'],
 dica:'Adicione o creme de leite sempre no final e em fogo baixo, para não talhar.'},

{id:'r17', nome:'Feijoada simplificada', ref:['almoco'], dif:'complexo', min:120, porc:6, kcal:650, tags:['comfort'], emoji:'🍲',
 ing:['500 g de feijão preto (deixado de molho na véspera)','200 g de linguiça calabresa fatiada','200 g de bacon em cubos','150 g de costelinha de porco','1 cebola picada','3 dentes de alho picados','2 folhas de louro','Sal e pimenta a gosto'],
 modo:['Cozinhe o feijão na panela de pressão com água e as folhas de louro por cerca de 40 minutos após pegar pressão, até ficar macio.','Em uma panela grande, frite o bacon até dourar e soltar gordura.','Adicione a costelinha e a linguiça e doure bem todos os lados.','Junte a cebola e o alho e refogue até ficarem macios.','Acrescente o feijão já cozido com parte do caldo e deixe cozinhar em fogo baixo por 30-40 minutos, mexendo de vez em quando, até o caldo engrossar.','Ajuste o sal e a pimenta e sirva com arroz branco, couve refogada e farofa.'],
 dica:'Amasse um pouco do feijão contra a panela: isso engrossa o caldo naturalmente, sem precisar de farinha.'},

{id:'r18', nome:'Macarrão à bolonhesa', ref:['almoco','jantar'], dif:'medio', min:40, porc:4, kcal:520, tags:['comfort'], emoji:'🍝',
 ing:['400 g de macarrão espaguete','400 g de carne moída','1 cebola picada','2 dentes de alho picados','1 lata de molho de tomate (ou 500 g de tomate pelado)','1 colher de sopa de azeite','Manjericão e orégano a gosto','Sal e pimenta a gosto'],
 modo:['Cozinhe o macarrão em água fervente com sal até ficar al dente, seguindo o tempo da embalagem.','Em uma panela, refogue a cebola e o alho no azeite até dourarem.','Adicione a carne moída e cozinhe até perder a cor rosada, desmanchando bem com a colher.','Junte o molho de tomate, tempere com sal, pimenta e orégano e deixe apurar em fogo baixo por 15-20 minutos.','Finalize com manjericão fresco picado.','Sirva o molho sobre o macarrão escorrido, com queijo parmesão ralado por cima.'],
 dica:'Reserve um pouco da água do cozimento do macarrão: ela ajuda a dar liga ao molho se ficar espesso demais.'},

{id:'r19', nome:'Salmão grelhado com legumes salteados', ref:['almoco','jantar'], dif:'medio', min:25, porc:2, kcal:420, tags:['saudavel','semgluten','proteico'], emoji:'🐟',
 ing:['2 postas de salmão','1 abobrinha em fatias','1 cenoura em fatias','1 punhado de brócolis','2 colheres de sopa de azeite','Suco de 1 limão','Sal e pimenta a gosto'],
 modo:['Tempere as postas de salmão com sal, pimenta e um pouco de limão.','Aqueça 1 colher de azeite em uma frigideira antiaderente e grelhe o salmão com a pele para baixo por 4 minutos, vire e grelhe mais 3-4 minutos.','Em outra frigideira, salteie a abobrinha, a cenoura e o brócolis no restante do azeite por 5-6 minutos, temperando com sal e pimenta.','Finalize o salmão com um fio de limão e sirva com os legumes salteados.'],
 dica:'Não mexa o salmão nos primeiros minutos: isso garante uma pele crocante e evita que ele grude na frigideira.'},

{id:'r20', nome:'Risoto de camarão', ref:['almoco','jantar'], dif:'complexo', min:45, porc:4, kcal:480, tags:['proteico'], emoji:'🍤',
 ing:['400 g de camarão limpo','1,5 xícara de arroz arbóreo','1 cebola picada','2 dentes de alho picados','1 litro de caldo de legumes ou peixe quente','0,5 xícara de vinho branco','2 colheres de sopa de manteiga','50 g de queijo parmesão ralado'],
 modo:['Tempere os camarões com sal, alho e limão e reserve.','Em uma panela, refogue a cebola e metade do alho em 1 colher de manteiga até ficarem translúcidos.','Adicione o arroz arbóreo e refogue por 2 minutos, mexendo sempre, até ficar brilhante.','Junte o vinho branco e deixe evaporar.','Adicione o caldo quente aos poucos, uma concha de cada vez, mexendo sempre e só colocando mais quando o líquido anterior for absorvido — repita por cerca de 18-20 minutos.','Em outra frigideira, salteie os camarões rapidamente com o restante do alho, 2-3 minutos até ficarem rosados.','Quando o arroz estiver cremoso e "al dente", desligue o fogo, misture a manteiga restante e o parmesão (mantecatura), e finalize com os camarões por cima.'],
 dica:'Mexer sem parar libera o amido do arroz arbóreo, criando a cremosidade típica do risoto — não pule essa etapa.'},

{id:'r21', nome:'Escondidinho de carne seca com mandioca', ref:['almoco','jantar'], dif:'medio', min:60, porc:4, kcal:490, tags:['comfort'], emoji:'🥘',
 ing:['400 g de carne seca dessalgada e cozida (desfiada)','800 g de mandioca cozida','1 cebola picada','2 dentes de alho picados','1 colher de sopa de manteiga','100 ml de leite','100 g de queijo muçarela ralado','Cheiro-verde a gosto'],
 modo:['Amasse a mandioca cozida ainda quente com a manteiga e o leite até formar um purê liso. Reserve.','Refogue a cebola e o alho em um fio de azeite até dourarem.','Adicione a carne seca desfiada e refogue por 5-8 minutos até incorporar os temperos.','Finalize com cheiro-verde picado.','Em um refratário, faça uma camada de purê de mandioca, uma camada da carne refogada e cubra com outra camada de purê.','Polvilhe o queijo muçarela por cima e leve ao forno a 200°C por 15-20 minutos até gratinar.'],
 dica:'Deixe a carne seca de molho na geladeira, trocando a água 2-3 vezes, por pelo menos 12 horas antes de cozinhar.'},

{id:'r22', nome:'Salada completa com grão-de-bico e quinoa', ref:['almoco'], dif:'facil', min:20, porc:2, kcal:380, tags:['saudavel','vegano','semgluten'], emoji:'🥗',
 ing:['1 xícara de grão-de-bico cozido','0,5 xícara de quinoa cozida','1 tomate picado','0,5 pepino picado','0,5 cebola roxa fatiada','2 colheres de sopa de azeite','Suco de 1 limão','Sal e pimenta a gosto'],
 modo:['Em uma tigela grande, misture o grão-de-bico, a quinoa, o tomate, o pepino e a cebola roxa.','Tempere com azeite, limão, sal e pimenta.','Misture bem e deixe descansar 5 minutos antes de servir para os sabores se misturarem.'],
 dica:'Adicione folhas verdes ou queijo feta na hora de servir para variar o prato ao longo da semana.'},

/* ---------------- LANCHE DA TARDE ---------------- */
{id:'r23', nome:'Sanduíche natural de frango', ref:['lancheT'], dif:'facil', min:15, porc:2, kcal:320, tags:['saudavel','proteico'], emoji:'🥪',
 ing:['200 g de peito de frango cozido e desfiado','2 colheres de sopa de iogurte natural','1 colher de sopa de mostarda','1 cenoura ralada','4 fatias de pão de forma integral','Folhas de alface'],
 modo:['Misture o frango desfiado com o iogurte, a mostarda e a cenoura ralada.','Tempere com sal e pimenta a gosto.','Monte os sanduíches intercalando pão, alface e o recheio de frango.','Corte ao meio e sirva.'],
 dica:'Use frango do dia anterior (sobras do almoço) para deixar o preparo ainda mais rápido.'},

{id:'r24', nome:'Crepioca low carb', ref:['lancheT','cafe'], dif:'facil', min:10, porc:1, kcal:230, tags:['rapido','lowcarb','semgluten','proteico'], emoji:'🫓',
 ing:['1 ovo','2 colheres de sopa de goma de tapioca','1 colher de sopa de queijo cottage ou ralado','Sal a gosto','Recheio a gosto (queijo, presunto ou frango)'],
 modo:['Bata o ovo com a goma de tapioca, o queijo e o sal até formar uma massa homogênea.','Aqueça uma frigideira antiaderente em fogo médio e despeje a massa, espalhando bem.','Deixe firmar por cerca de 2 minutos.','Vire com cuidado, adicione o recheio e dobre ao meio.','Cozinhe mais 1-2 minutos e sirva.'],
 dica:'Substitua o ovo por 2 claras para uma versão ainda mais leve em gordura.'},

{id:'r25', nome:'Pão na chapa com manteiga', ref:['lancheT','cafe'], dif:'facil', min:8, porc:1, kcal:210, tags:['rapido'], emoji:'🍞',
 ing:['2 fatias de pão francês ou de forma','1 colher de sopa de manteiga','Orégano a gosto (opcional)'],
 modo:['Passe a manteiga generosamente nas fatias de pão.','Aqueça uma frigideira ou chapa em fogo médio.','Doure o pão dos dois lados até ficar crocante por fora.','Polvilhe orégano se desejar e sirva quente.'],
 dica:'Pressione levemente o pão com uma espátula na chapa para um dourado mais uniforme.'},

{id:'r26', nome:'Bolo de caneca de chocolate', ref:['lancheT','ceia'], dif:'facil', min:6, porc:1, kcal:290, tags:['rapido','doce'], emoji:'☕',
 ing:['4 colheres de sopa de farinha de trigo','3 colheres de sopa de açúcar','2 colheres de sopa de chocolate em pó','1 ovo','3 colheres de sopa de leite','2 colheres de sopa de óleo','0,5 colher de chá de fermento em pó'],
 modo:['Em uma caneca grande, misture todos os ingredientes secos.','Adicione o ovo, o leite e o óleo e mexa bem até não haver grumos.','Leve ao micro-ondas em potência alta por 2 a 3 minutos, até crescer e firmar (o tempo varia por aparelho).','Deixe descansar 1 minuto antes de comer, pois continua cozinhando com o calor.'],
 dica:'Não encha a caneca além de 2/3 da capacidade: a massa cresce bastante no micro-ondas.'},

{id:'r27', nome:'Wrap integral de atum', ref:['lancheT'], dif:'facil', min:10, porc:1, kcal:310, tags:['saudavel','proteico'], emoji:'🌯',
 ing:['1 lata de atum em água escorrido','2 colheres de sopa de requeijão light','1 tomate picado','Folhas de rúcula','1 tortilha integral'],
 modo:['Misture o atum com o requeijão até formar uma pasta.','Aqueça levemente a tortilha para ficar mais maleável.','Espalhe o recheio de atum sobre a tortilha.','Adicione o tomate e a rúcula.','Enrole bem apertado e corte ao meio para servir.'],
 dica:'Enrole em papel-alumínio por alguns minutos antes de cortar: ajuda o wrap a manter o formato.'},

{id:'r28', nome:'Torrada com abacate e ovo pochê', ref:['lancheT','cafe'], dif:'facil', min:15, porc:1, kcal:290, tags:['saudavel','vegetariano'], emoji:'🍞',
 ing:['2 fatias de pão integral','0,5 abacate amassado','1 ovo','1 colher de sopa de vinagre','Sal, pimenta e limão a gosto'],
 modo:['Ferva água com o vinagre em uma panela pequena.','Crie um redemoinho na água com uma colher e quebre o ovo no centro, cozinhando por 3 minutos.','Retire o ovo com uma escumadeira e deixe escorrer.','Toste o pão e espalhe o abacate amassado temperado com sal, pimenta e limão.','Coloque o ovo pochê por cima e finalize com mais uma pitada de sal e pimenta.'],
 dica:'A água deve estar em fervura branda (não fervendo forte) para o ovo pochê não se desmanchar.'},

{id:'r29', nome:'Cookies de aveia e banana (2 ingredientes)', ref:['lancheT','lancheM'], dif:'medio', min:25, porc:6, kcal:120, tags:['saudavel','semgluten','vegetariano'], emoji:'🍪',
 ing:['2 bananas maduras amassadas','1,5 xícara de aveia em flocos','2 colheres de sopa de gotas de chocolate (opcional)','1 colher de chá de canela'],
 modo:['Pré-aqueça o forno a 180°C e forre uma assadeira com papel manteiga.','Amasse bem as bananas até formar um purê.','Misture a aveia e a canela ao purê de banana até formar uma massa consistente.','Adicione as gotas de chocolate se desejar.','Com uma colher, faça montinhos na assadeira e achate levemente.','Asse por 15-18 minutos até dourarem levemente nas bordas.'],
 dica:'Use bananas bem maduras (com pintinhas pretas): elas adoçam naturalmente sem precisar de açúcar.'},

/* ---------------- JANTAR ---------------- */
{id:'r30', nome:'Sopa de legumes com frango desfiado', ref:['jantar'], dif:'facil', min:35, porc:4, kcal:280, tags:['saudavel'], emoji:'🍜',
 ing:['300 g de peito de frango','1 cenoura picada','1 batata picada','1 abobrinha picada','0,5 xícara de milho','1 cebola picada','1 dente de alho picado','Sal e cheiro-verde a gosto'],
 modo:['Cozinhe o frango em água com sal até ficar macio (cerca de 20 minutos), depois desfie e reserve o caldo.','No mesmo caldo, refogue a cebola e o alho.','Adicione a cenoura e a batata e cozinhe por 10 minutos.','Junte a abobrinha e o milho e cozinhe mais 8-10 minutos até os legumes ficarem macios.','Volte o frango desfiado para a panela e ajuste o sal.','Finalize com cheiro-verde picado e sirva bem quente.'],
 dica:'Amasse um pouco da batata dentro da panela para engrossar o caldo naturalmente.'},

{id:'r31', nome:'Omelete recheado de legumes', ref:['jantar','cafe'], dif:'facil', min:15, porc:1, kcal:300, tags:['vegetariano','rapido','proteico'], emoji:'🍳',
 ing:['3 ovos','0,5 abobrinha picada','0,5 pimentão picado','2 colheres de sopa de cebola picada','1 colher de sopa de azeite','Sal e pimenta a gosto'],
 modo:['Refogue a abobrinha, o pimentão e a cebola no azeite até ficarem macios. Reserve.','Bata os ovos com sal e pimenta.','Aqueça uma frigideira antiaderente e despeje os ovos batidos.','Quando as bordas começarem a firmar, espalhe os legumes refogados sobre metade da omelete.','Dobre ao meio e cozinhe mais 1-2 minutos até o centro firmar.','Sirva com uma salada verde.'],
 dica:'Deixe os legumes esfriarem um pouco antes de rechear: evita que a omelete rasgue.'},

{id:'r32', nome:'Filé de frango ao molho de mostarda e mel com purê', ref:['jantar','almoco'], dif:'medio', min:35, porc:2, kcal:450, tags:['comfort'], emoji:'🍗',
 ing:['2 filés de peito de frango','2 colheres de sopa de mostarda','1 colher de sopa de mel','1 colher de sopa de azeite','3 batatas médias','2 colheres de sopa de manteiga','100 ml de leite','Sal e pimenta a gosto'],
 modo:['Cozinhe as batatas em água com sal até ficarem bem macias, escorra e amasse com a manteiga e o leite até formar um purê cremoso. Tempere com sal.','Tempere o frango com sal e pimenta.','Em uma tigela, misture a mostarda e o mel.','Grelhe o frango no azeite por 5 minutos de cada lado até dourar.','Pincele o molho de mostarda com mel sobre o frango e deixe caramelizar por 1-2 minutos de cada lado.','Sirva o frango fatiado sobre o purê de batatas.'],
 dica:'Deixe o frango descansar 3 minutos antes de fatiar: os sucos se redistribuem e a carne fica mais suculenta.'},

{id:'r33', nome:'Yakisoba caseiro', ref:['jantar','almoco'], dif:'medio', min:30, porc:3, kcal:420, tags:[], emoji:'🍜',
 ing:['300 g de macarrão para yakisoba (ou espaguete)','200 g de peito de frango em tiras','1 cenoura em tiras','1 pimentão em tiras','1 xícara de repolho fatiado','2 colheres de sopa de molho shoyu','1 colher de sopa de óleo de gergelim','2 dentes de alho picados'],
 modo:['Cozinhe o macarrão em água fervente conforme o tempo da embalagem e reserve.','Em uma frigideira ou wok bem quente, refogue o alho no óleo por 30 segundos.','Adicione o frango e refogue até dourar, cerca de 5-6 minutos.','Junte a cenoura e o pimentão e refogue por 3-4 minutos em fogo alto, mexendo sempre.','Adicione o repolho e refogue mais 2 minutos, mantendo os legumes crocantes.','Junte o macarrão cozido e o shoyu, misture bem por 2 minutos e finalize com o óleo de gergelim.'],
 dica:'Use fogo alto e mexa sempre: é isso que garante o sabor "de wok" e legumes crocantes, não murchos.'},

{id:'r34', nome:'Pizza caseira de liquidificador', ref:['jantar'], dif:'medio', min:40, porc:4, kcal:390, tags:['comfort'], emoji:'🍕',
 ing:['2 ovos','1 xícara de leite','2 xícaras de farinha de trigo','1 colher de sopa de óleo','1 colher de sopa de fermento em pó','200 g de molho de tomate','200 g de queijo muçarela ralado','Orégano e coberturas a gosto'],
 modo:['Pré-aqueça o forno a 220°C.','Bata os ovos, o leite, a farinha e o óleo no liquidificador até formar uma massa lisa e sem grumos.','Adicione o fermento por último e bata rapidamente só para misturar.','Despeje a massa em uma forma redonda untada e leve ao forno por 10 minutos, até firmar e dourar levemente por baixo.','Retire, espalhe o molho de tomate, o queijo e as coberturas escolhidas.','Volte ao forno por mais 10-15 minutos até o queijo derreter e dourar.'],
 dica:'Pré-assar a massa antes de rechear evita que a pizza fique com o meio "encharcado".'},

{id:'r35', nome:'Peixe assado com batatas e ervas', ref:['jantar','almoco'], dif:'medio', min:45, porc:2, kcal:400, tags:['saudavel','semgluten'], emoji:'🐠',
 ing:['2 filés de peixe branco (tilápia ou merluza)','3 batatas médias em rodelas','2 colheres de sopa de azeite','2 dentes de alho picados','Alecrim e tomilho a gosto','Suco de 1 limão','Sal e pimenta a gosto'],
 modo:['Pré-aqueça o forno a 200°C.','Tempere as batatas com metade do azeite, sal, pimenta e ervas e disponha em uma assadeira.','Asse as batatas por 20 minutos até começarem a dourar.','Tempere o peixe com sal, pimenta, alho, limão e o restante do azeite.','Retire a assadeira, abra espaço entre as batatas e coloque os filés de peixe.','Volte ao forno por mais 15-18 minutos até o peixe ficar macio e as batatas douradas.'],
 dica:'O peixe está pronto quando a carne fica opaca e se desfaz facilmente com um garfo.'},

{id:'r36', nome:'Lasanha de berinjela (low carb)', ref:['jantar'], dif:'complexo', min:75, porc:4, kcal:380, tags:['lowcarb','saudavel','vegetariano'], emoji:'🍆',
 ing:['3 berinjelas fatiadas finas no sentido do comprimento','400 g de carne moída (ou proteína de soja para versão vegetariana)','500 g de molho de tomate','200 g de queijo muçarela ralado','100 g de ricota amassada','2 dentes de alho picados','Sal e orégano a gosto'],
 modo:['Salgue as fatias de berinjela e deixe descansar 15 minutos para tirar o amargor, depois seque com papel-toalha.','Grelhe as fatias de berinjela em uma frigideira com um fio de azeite até dourarem dos dois lados. Reserve.','Refogue o alho e a carne moída até dourar, junte o molho de tomate e o orégano e deixe apurar por 10 minutos.','Em um refratário, monte camadas alternando berinjela grelhada, molho com carne e a ricota amassada.','Finalize com uma camada de berinjela e cubra com queijo muçarela ralado.','Leve ao forno a 200°C por 25-30 minutos até gratinar e borbulhar nas bordas.'],
 dica:'Salgar a berinjela antes é essencial: além de tirar o amargor, evita que ela solte muita água na lasanha.'},

{id:'r37', nome:'Quiche de legumes sem massa', ref:['jantar'], dif:'medio', min:45, porc:4, kcal:260, tags:['vegetariano','lowcarb','saudavel'], emoji:'🥧',
 ing:['6 ovos','200 ml de creme de leite (ou leite)','1 abobrinha ralada','1 cenoura ralada','100 g de queijo ralado','2 colheres de sopa de farinha de aveia','Sal, pimenta e noz-moscada a gosto'],
 modo:['Pré-aqueça o forno a 180°C e unte uma forma de torta.','Esprema a abobrinha ralada em um pano para retirar o excesso de água.','Bata os ovos com o creme de leite, sal, pimenta e noz-moscada.','Misture a abobrinha, a cenoura, o queijo e a farinha de aveia à mistura de ovos.','Despeje na forma untada.','Asse por 30-35 minutos até firmar e dourar por cima.'],
 dica:'Espere a quiche amornar por 10 minutos antes de cortar: ela firma mais e não desmancha.'},

/* ---------------- CEIA / SOBREMESA ---------------- */
{id:'r38', nome:'Chá calmante com torrada integral', ref:['ceia'], dif:'facil', min:8, porc:1, kcal:90, tags:['saudavel','rapido'], emoji:'🍵',
 ing:['1 saquinho de chá de camomila ou erva-cidreira','200 ml de água quente','1 fatia de pão integral torrada','1 colher de chá de mel (opcional)'],
 modo:['Ferva a água e despeje sobre o saquinho de chá.','Deixe em infusão por 5 minutos e adoce com mel se desejar.','Sirva acompanhado da torrada integral.'],
 dica:'Evite açúcar à noite: o mel em pequena quantidade é uma opção mais leve para a digestão.'},

{id:'r39', nome:'Gelatina diet colorida', ref:['ceia'], dif:'facil', min:10, porc:4, kcal:20, tags:['saudavel','rapido'], emoji:'🍮',
 ing:['1 caixa de gelatina em pó diet (sabor a gosto)','500 ml de água (metade quente, metade gelada)'],
 modo:['Dissolva o pó de gelatina em 250 ml de água fervente, mexendo bem até não sobrar grumos.','Adicione os outros 250 ml de água gelada e misture.','Distribua em taças e leve à geladeira por pelo menos 3 horas até firmar.'],
 dica:'Use água com gelo em vez de só gelada: a gelatina firma ainda mais rápido.'},

{id:'r40', nome:'Banana assada com canela e mel', ref:['ceia'], dif:'facil', min:20, porc:2, kcal:150, tags:['saudavel','vegano'], emoji:'🍌',
 ing:['2 bananas com casca','1 colher de sopa de mel','1 colher de chá de canela'],
 modo:['Pré-aqueça o forno a 190°C.','Faça um corte superficial no sentido do comprimento em cada banana, sem descascar.','Regue com mel e polvilhe canela sobre o corte.','Asse por 12-15 minutos até a casca escurecer e a fruta ficar macia.','Sirva quente, direto da casca, com uma colher.'],
 dica:'Pode fazer na airfryer a 180°C por 8-10 minutos, se preferir.'},

{id:'r41', nome:'Mousse de maracujá', ref:['ceia'], dif:'medio', min:20, porc:6, kcal:220, tags:['doce'], emoji:'🍮',
 ing:['1 lata de leite condensado','1 lata de creme de leite','200 ml de suco concentrado de maracujá (polpa)','1 envelope de gelatina incolor sem sabor (12g), hidratada'],
 modo:['Bata o leite condensado, o creme de leite e a polpa de maracujá no liquidificador até ficar homogêneo.','Hidrate a gelatina conforme as instruções da embalagem e dissolva em banho-maria ou micro-ondas.','Com o liquidificador ligado em velocidade baixa, adicione a gelatina dissolvida e bata mais 30 segundos.','Distribua em taças individuais.','Leve à geladeira por no mínimo 3 horas até firmar bem.'],
 dica:'Para um toque extra, reserve um pouco da polpa pura para servir por cima antes de levar à geladeira.'},

{id:'r42', nome:'Pudim de leite condensado', ref:['ceia'], dif:'complexo', min:90, porc:8, kcal:280, tags:['doce'], emoji:'🍮',
 ing:['1 lata de leite condensado','A mesma medida de leite (usando a lata)','3 ovos','1 xícara de açúcar (para a calda)'],
 modo:['Para a calda, derreta o açúcar em fogo baixo em uma panela até formar um caramelo dourado (sem mexer, apenas balançando a panela). Despeje imediatamente em uma forma de pudim, cobrindo o fundo.','Bata no liquidificador o leite condensado, o leite e os ovos por cerca de 3 minutos.','Despeje a mistura na forma já caramelizada.','Cubra com papel-alumínio e leve para assar em banho-maria a 180°C por 50-60 minutos, até firmar (o centro deve tremer levemente).','Deixe esfriar completamente e leve à geladeira por pelo menos 4 horas, de preferência de um dia para o outro.','Para desenformar, passe uma faca fina nas bordas e vire em um prato fundo com cuidado.'],
 dica:'Nunca mexa o caramelo enquanto derrete o açúcar — apenas incline a panela. Mexer faz o açúcar cristalizar.'},

{id:'r43', nome:'Brigadeiro fit de cacau', ref:['ceia','lancheT'], dif:'medio', min:20, porc:8, kcal:70, tags:['saudavel','fitness'], emoji:'🍫',
 ing:['1 xícara de leite em pó desnatado','3 colheres de sopa de cacau em pó 100%','0,5 xícara de leite (ou bebida vegetal)','2 colheres de sopa de mel ou adoçante culinário','1 colher de sopa de manteiga ou óleo de coco'],
 modo:['Misture o leite em pó e o cacau em uma panela.','Adicione o leite aos poucos, mexendo até dissolver bem sem grumos.','Leve ao fogo baixo com a manteiga e o mel, mexendo sempre por 5-8 minutos até desgrudar do fundo da panela.','Deixe esfriar em um prato untado por cerca de 30 minutos.','Enrole em bolinhas pequenas e passe em cacau em pó ou granulado.'],
 dica:'Unte as mãos com um pouco de óleo de coco antes de enrolar: evita que a massa grude nos dedos.'},

{id:'r44', nome:'Iogurte grego com mel e nozes', ref:['ceia','lancheM'], dif:'facil', min:5, porc:1, kcal:210, tags:['rapido','proteico','saudavel'], emoji:'🥣',
 ing:['1 pote de iogurte grego natural (170 g)','1 colher de sopa de mel','2 colheres de sopa de nozes picadas','Canela a gosto'],
 modo:['Coloque o iogurte grego em uma tigela.','Regue com o mel.','Finalize com as nozes picadas e uma pitada de canela.'],
 dica:'Troque as nozes por castanha-do-pará ou amêndoas para variar o lanche ao longo da semana.'},

];

/* conversor de medidas caseiras -> gramas por unidade */
const CONV = {
  'Farinha de trigo':   {colherCha:3,  colherSopa:8,  xicara:120},
  'Farinha de aveia':   {colherCha:3,  colherSopa:8,  xicara:100},
  'Açúcar':             {colherCha:4,  colherSopa:12, xicara:180},
  'Arroz cru':          {colherCha:5,  colherSopa:15, xicara:200},
  'Óleo':               {colherCha:3,  colherSopa:9,  xicara:190},
  'Manteiga':           {colherCha:5,  colherSopa:15, xicara:200},
  'Leite em pó':        {colherCha:2,  colherSopa:7,  xicara:110},
  'Chocolate em pó':    {colherCha:3,  colherSopa:8,  xicara:100},
  'Sal':                {colherCha:6,  colherSopa:18, xicara:280},
  'Mel':                {colherCha:7,  colherSopa:21, xicara:340},
  'Queijo ralado':      {colherCha:2,  colherSopa:6,  xicara:90},
  'Fermento em pó':     {colherCha:4,  colherSopa:12, xicara:190},
};
